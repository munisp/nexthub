// Package kafka provides a typed Kafka producer for all NextHub domain events.
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	kafkago "github.com/segmentio/kafka-go"
	"go.uber.org/zap"
)

// Topic constants — mirror nexthubKafkaProducer.ts
const (
	TopicTransferReceived  = "nexthub.transfer.received.v1"
	TopicTransferCommitted = "nexthub.transfer.committed.v1"
	TopicTransferAborted   = "nexthub.transfer.aborted.v1"
	TopicFXRates           = "nexthub.fx.rates.v1"
	TopicNDCBreach         = "nexthub.ndc.breach.v1"
	TopicSettlementClosed  = "nexthub.settlement.closed.v1"
	TopicSettlementSettled = "nexthub.settlement.settled.v1"
	TopicParticipantStatus = "nexthub.participant.status.v1"
	TopicPaymentInitiated  = "nexthub.payment.initiated.v1"
	TopicPaymentReversed   = "nexthub.payment.reversed.v1"
	TopicDisputeCreated    = "nexthub.dispute.created.v1"
	TopicDisputeResolved   = "nexthub.dispute.resolved.v1"
	TopicKYCUpdate         = "nexthub.kyc.update.v1"
	TopicLiquidityAlert    = "nexthub.liquidity.alert.v1"
	TopicCBDCTransfer      = "nexthub.cbdc.transfer.v1"
	TopicG2PDisbursement   = "nexthub.g2p.disbursement.v1"
	TopicRemittance        = "nexthub.remittance.transfer.v1"
	TopicAuditTrail        = "nexthub.audit.trail.v1"
)

// Envelope wraps every event with standard metadata.
type Envelope struct {
	EventID   string          `json:"eventId"`
	EventType string          `json:"eventType"`
	Source    string          `json:"source"`
	Timestamp time.Time       `json:"timestamp"`
	Payload   json.RawMessage `json:"payload"`
}

// Producer is a typed Kafka event publisher.
type Producer struct {
	writer *kafkago.Writer
	log    *zap.Logger
}

// NewProducer creates a new Kafka producer connected to the given brokers.
func NewProducer(brokers string, log *zap.Logger) *Producer {
	w := &kafkago.Writer{
		Addr:         kafkago.TCP(brokers),
		Balancer:     &kafkago.LeastBytes{},
		RequiredAcks: kafkago.RequireOne,
		Async:        false,
	}
	return &Producer{writer: w, log: log}
}

// Publish serialises the payload into an Envelope and writes it to the topic.
func (p *Producer) Publish(ctx context.Context, topic string, key string, payload any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("kafka marshal payload: %w", err)
	}

	env := Envelope{
		EventID:   uuid.NewString(),
		EventType: topic,
		Source:    "nexthub-bridge",
		Timestamp: time.Now().UTC(),
		Payload:   raw,
	}

	envBytes, err := json.Marshal(env)
	if err != nil {
		return fmt.Errorf("kafka marshal envelope: %w", err)
	}

	msg := kafkago.Message{
		Topic: topic,
		Key:   []byte(key),
		Value: envBytes,
	}

	if err := p.writer.WriteMessages(ctx, msg); err != nil {
		p.log.Warn("kafka_publish_failed", zap.String("topic", topic), zap.Error(err))
		return fmt.Errorf("kafka write: %w", err)
	}

	p.log.Debug("kafka_published", zap.String("topic", topic), zap.String("key", key))
	return nil
}

// Close shuts down the writer.
func (p *Producer) Close() error {
	return p.writer.Close()
}
