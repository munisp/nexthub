// Package kafka implements the Kafka event bridge for the Central Bank
// Liquidity Adapter. It consumes settlement.window.settled events from
// NextHub's Kafka cluster and publishes rtgs.submission.* events back.
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/IBM/sarama"
	"go.uber.org/zap"
)

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	TopicSettlementSettled   = "nexthub.settlement.window.settled"
	TopicRTGSSubmitted       = "nexthub.rtgs.submission.submitted"
	TopicRTGSSettled         = "nexthub.rtgs.submission.settled"
	TopicRTGSFailed          = "nexthub.rtgs.submission.failed"
	TopicLiquidityAlert      = "nexthub.liquidity.alert"
	ConsumerGroup            = "cb-liquidity-adapter"
)

// ─── Event schemas ────────────────────────────────────────────────────────────

type SettlementSettledEvent struct {
	WindowID    string    `json:"windowId"`
	WindowType  string    `json:"windowType"`
	SettledAt   time.Time `json:"settledAt"`
	TotalKobo   int64     `json:"totalKobo"`
	Currency    string    `json:"currency"`
	Positions   []PositionEntry `json:"positions"`
}

type PositionEntry struct {
	DFSPID        string `json:"dfspId"`
	BIC           string `json:"bic"`
	BankCode      string `json:"bankCode"`
	NUBANAccount  string `json:"nubanAccount"`
	NetAmountKobo int64  `json:"netAmountKobo"`
}

type RTGSSubmittedEvent struct {
	WindowID      string    `json:"windowId"`
	MessageID     string    `json:"messageId"`
	RTGSReference string    `json:"rtgsReference"`
	Status        string    `json:"status"`
	SubmittedAt   time.Time `json:"submittedAt"`
	Protocol      string    `json:"protocol"` // "ISO20022" or "MT202"
}

type LiquidityAlertEvent struct {
	DFSPID        string    `json:"dfspId"`
	AlertType     string    `json:"alertType"` // "NDC_BREACH", "NEGATIVE_POSITION", "SETTLEMENT_FAIL"
	AmountKobo    int64     `json:"amountKobo"`
	Threshold     int64     `json:"thresholdKobo"`
	TriggeredAt   time.Time `json:"triggeredAt"`
	Message       string    `json:"message"`
}

// ─── Bridge ───────────────────────────────────────────────────────────────────

type Bridge struct {
	consumer sarama.ConsumerGroup
	producer sarama.SyncProducer
	log      *zap.Logger
	handler  EventHandler
}

// EventHandler is called for each settlement.window.settled event.
type EventHandler func(ctx context.Context, event SettlementSettledEvent) error

func NewBridge(brokers []string, log *zap.Logger, handler EventHandler) (*Bridge, error) {
	// Consumer config
	cCfg := sarama.NewConfig()
	cCfg.Version = sarama.V3_6_0_0
	cCfg.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{sarama.NewBalanceStrategyRoundRobin()}
	cCfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	cCfg.Consumer.Return.Errors = true

	consumer, err := sarama.NewConsumerGroup(brokers, ConsumerGroup, cCfg)
	if err != nil {
		return nil, fmt.Errorf("kafka: new consumer group: %w", err)
	}

	// Producer config
	pCfg := sarama.NewConfig()
	pCfg.Version = sarama.V3_6_0_0
	pCfg.Producer.Return.Successes = true
	pCfg.Producer.Return.Errors = true
	pCfg.Producer.RequiredAcks = sarama.WaitForAll
	pCfg.Producer.Retry.Max = 5
	pCfg.Producer.Compression = sarama.CompressionSnappy
	pCfg.Producer.Flush.Frequency = 5 * time.Millisecond
	pCfg.Producer.Flush.Bytes = 65536

	producer, err := sarama.NewSyncProducer(brokers, pCfg)
	if err != nil {
		consumer.Close()
		return nil, fmt.Errorf("kafka: new producer: %w", err)
	}

	return &Bridge{
		consumer: consumer,
		producer: producer,
		log:      log,
		handler:  handler,
	}, nil
}

// Run starts the Kafka consumer loop. It blocks until ctx is cancelled.
func (b *Bridge) Run(ctx context.Context) error {
	topics := []string{TopicSettlementSettled}
	handler := &consumerGroupHandler{bridge: b}

	for {
		if err := b.consumer.Consume(ctx, topics, handler); err != nil {
			b.log.Error("kafka.consume_error", zap.Error(err))
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

// PublishRTGSSubmitted publishes a rtgs.submission.submitted event.
func (b *Bridge) PublishRTGSSubmitted(evt RTGSSubmittedEvent) error {
	return b.publish(TopicRTGSSubmitted, evt.WindowID, evt)
}

// PublishRTGSSettled publishes a rtgs.submission.settled event.
func (b *Bridge) PublishRTGSSettled(evt RTGSSubmittedEvent) error {
	return b.publish(TopicRTGSSettled, evt.WindowID, evt)
}

// PublishRTGSFailed publishes a rtgs.submission.failed event.
func (b *Bridge) PublishRTGSFailed(evt RTGSSubmittedEvent) error {
	return b.publish(TopicRTGSFailed, evt.WindowID, evt)
}

// PublishLiquidityAlert publishes a liquidity alert for NDC breaches.
func (b *Bridge) PublishLiquidityAlert(evt LiquidityAlertEvent) error {
	return b.publish(TopicLiquidityAlert, evt.DFSPID, evt)
}

func (b *Bridge) publish(topic, key string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("kafka: marshal payload: %w", err)
	}
	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(data),
	}
	_, _, err = b.producer.SendMessage(msg)
	if err != nil {
		b.log.Error("kafka.publish_failed", zap.String("topic", topic), zap.Error(err))
		return fmt.Errorf("kafka: send message to %s: %w", topic, err)
	}
	return nil
}

func (b *Bridge) Close() {
	b.consumer.Close()
	b.producer.Close()
}

// ─── Sarama ConsumerGroupHandler ─────────────────────────────────────────────

type consumerGroupHandler struct {
	bridge *Bridge
}

func (h *consumerGroupHandler) Setup(_ sarama.ConsumerGroupSession) error   { return nil }
func (h *consumerGroupHandler) Cleanup(_ sarama.ConsumerGroupSession) error { return nil }

func (h *consumerGroupHandler) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		var evt SettlementSettledEvent
		if err := json.Unmarshal(msg.Value, &evt); err != nil {
			h.bridge.log.Error("kafka.unmarshal_failed",
				zap.String("topic", msg.Topic),
				zap.Error(err),
			)
			session.MarkMessage(msg, "")
			continue
		}

		ctx := context.Background()
		if err := h.bridge.handler(ctx, evt); err != nil {
			h.bridge.log.Error("kafka.handler_failed",
				zap.String("window_id", evt.WindowID),
				zap.Error(err),
			)
			// Do NOT mark — will be retried on next poll
			continue
		}
		session.MarkMessage(msg, "")
	}
	return nil
}
