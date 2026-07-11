// cmd/main.go — Central Bank Liquidity Adapter
//
// Bridges NextHub settlement engine with the CBN RTGS system.
// Every RTGS submission, raw XML message, and intraday liquidity position
// is persisted to PostgreSQL (national_switch_schema.ts tables).
//
// DB tables written:
//   rtgs_submissions       — one row per pacs.009 / MT202 sent
//   rtgs_messages          — raw XML archive (OUTBOUND + INBOUND ACK)
//   cb_liquidity_positions — intraday position per DFSP per window
//
// Language: Go 1.22
// Middleware: Kafka (Sarama), Redis (go-redis), PostgreSQL (pgx/v5)
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/munisp/nexthub/services/cb-liquidity-adapter/internal/iso20022"
	kafkabridge "github.com/munisp/nexthub/services/cb-liquidity-adapter/internal/kafka"
	"github.com/munisp/nexthub/services/cb-liquidity-adapter/internal/rtgs"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	log.Info("cb_liquidity_adapter.starting")

	// ── PostgreSQL pool ───────────────────────────────────────────────────────
	dbURL := mustEnv("DATABASE_URL")
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatal("db.connect_failed", zap.Error(err))
	}
	defer pool.Close()
	log.Info("cb_liquidity_adapter.db_connected")

	// ── Config from environment ───────────────────────────────────────────────
	brokers := splitEnv("KAFKA_BROKERS", "kafka:9092")
	rtgsCfg := rtgs.Config{
		ISO20022Endpoint:     getEnv("CBN_RTGS_ISO20022_URL", "https://rtgs.cbn.gov.ng/api/v1"),
		ISO20022APIKey:       getEnv("CBN_RTGS_API_KEY", ""),
		SWIFTFileActEndpoint: getEnv("SWIFT_FILEACT_URL", "https://fileact.swift.com"),
		SWIFTCertFile:        getEnv("SWIFT_CERT_FILE", ""),
		SWIFTKeyFile:         getEnv("SWIFT_KEY_FILE", ""),
		SWIFTCAFile:          getEnv("SWIFT_CA_FILE", ""),
		HubBIC:               getEnv("HUB_BIC", "NEXTHUBNG"),
		HubSettlementAccount: getEnv("HUB_SETTLEMENT_NUBAN", "0000000001"),
		HubSenderBIC:         getEnv("HUB_SENDER_BIC", "NEXTHUBNGXXX"),
		SubmitTimeout:        30 * time.Second,
		PollInterval:         10 * time.Second,
		MaxRetries:           5,
	}
	institutionID := getEnv("CBN_RTGS_INSTITUTION_ID", "NEXTHUB")

	// ── Redis (idempotency) ───────────────────────────────────────────────────
	rdb := redis.NewClient(&redis.Options{
		Addr:     getEnv("REDIS_ADDR", "redis:6379"),
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       3,
	})
	defer rdb.Close()

	// ── RTGS Connector ────────────────────────────────────────────────────────
	connector, err := rtgs.NewRTGSConnector(rtgsCfg, log)
	if err != nil {
		log.Fatal("rtgs.init_failed", zap.Error(err))
	}

	// ── Kafka Bridge ──────────────────────────────────────────────────────────
	handler := buildSettlementHandler(connector, pool, rdb, log, rtgsCfg, institutionID)
	bridge, err := kafkabridge.NewBridge(brokers, log, handler)
	if err != nil {
		log.Fatal("kafka.init_failed", zap.Error(err))
	}
	defer bridge.Close()

	// ── Graceful shutdown ─────────────────────────────────────────────────────
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)
	go func() {
		sig := <-sigCh
		log.Info("cb_liquidity_adapter.shutdown", zap.String("signal", sig.String()))
		cancel()
	}()

	log.Info("cb_liquidity_adapter.ready", zap.Strings("brokers", brokers))
	if err := bridge.Run(ctx); err != nil && err != context.Canceled {
		log.Fatal("kafka.run_failed", zap.Error(err))
	}
	log.Info("cb_liquidity_adapter.stopped")
}

// ─── Settlement Handler (with full DB persistence) ────────────────────────────

func buildSettlementHandler(
	connector *rtgs.RTGSConnector,
	pool *pgxpool.Pool,
	rdb *redis.Client,
	log *zap.Logger,
	cfg rtgs.Config,
	institutionID string,
) kafkabridge.EventHandler {
	return func(ctx context.Context, evt kafkabridge.SettlementSettledEvent) error {
		idempotencyKey := fmt.Sprintf("rtgs:submitted:%s", evt.WindowID)

		// ── Idempotency check ─────────────────────────────────────────────────
		exists, err := rdb.Exists(ctx, idempotencyKey).Result()
		if err != nil {
			log.Warn("redis.idempotency_check_failed", zap.Error(err))
		}
		if exists > 0 {
			log.Info("rtgs.already_submitted", zap.String("window_id", evt.WindowID))
			return nil
		}

		// ── Build ISO 20022 positions ─────────────────────────────────────────
		positions := make([]iso20022.NetPosition, len(evt.Positions))
		for i, p := range evt.Positions {
			positions[i] = iso20022.NetPosition{
				WindowID:      evt.WindowID,
				DFSPID:        p.DFSPID,
				BIC:           p.BIC,
				NUBANAccount:  p.NUBANAccount,
				BankCode:      p.BankCode,
				NetAmountKobo: p.NetAmountKobo,
				Currency:      evt.Currency,
			}
		}

		// ── Build pacs.009 XML ────────────────────────────────────────────────
		xmlPayload, msgID, err := iso20022.BuildPacs009(
			cfg.HubBIC,
			cfg.HubSettlementAccount,
			positions,
			evt.SettledAt,
		)
		if err != nil {
			log.Error("pacs009.build_failed", zap.String("window_id", evt.WindowID), zap.Error(err))
			return err
		}

		submissionID  := uuid.New().String()
		endToEndID    := uuid.New().String()
		tenantID      := evt.TenantID
		if tenantID == "" {
			tenantID = "default"
		}

		// ── Persist PENDING submission to DB ──────────────────────────────────
		_, dbErr := pool.Exec(ctx, `
			INSERT INTO rtgs_submissions (
				id, tenant_id, settlement_window_id, message_id, end_to_end_id,
				debtor_institution, creditor_institution, amount_kobo, currency,
				status, idempotency_key, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',$10,NOW(),NOW())
			ON CONFLICT (idempotency_key) DO NOTHING`,
			submissionID, tenantID, evt.WindowID, msgID, endToEndID,
			institutionID, "CBN-RTGS", evt.TotalKobo, evt.Currency,
			idempotencyKey,
		)
		if dbErr != nil {
			log.Error("db.insert_submission_failed", zap.Error(dbErr))
		}

		// ── Archive outbound XML ──────────────────────────────────────────────
		archiveMsg(ctx, pool, log, submissionID, "OUTBOUND", "pacs.009", xmlPayload)

		// ── Mark SUBMITTED ────────────────────────────────────────────────────
		updateSubmissionStatus(ctx, pool, log, submissionID, "SUBMITTED", "", "")

		// ── Submit to CBN RTGS ────────────────────────────────────────────────
		result, submitErr := connector.SubmitISO20022(ctx, msgID, xmlPayload)
		if submitErr != nil {
			log.Warn("rtgs.iso20022_failed_fallback_mt202",
				zap.String("window_id", evt.WindowID),
				zap.Error(submitErr),
			)
			mt202 := iso20022.BuildMT202(
				cfg.HubSenderBIC, "CBNLNGLA", msgID, evt.WindowID,
				evt.SettledAt, evt.Currency, evt.TotalKobo,
				cfg.HubBIC, "CBNLNGLA",
				fmt.Sprintf("NEXTHUB SETTLEMENT WINDOW %s", evt.WindowID),
			)
			result, submitErr = connector.SubmitMT202(ctx, mt202, msgID)
			if submitErr != nil {
				updateSubmissionStatus(ctx, pool, log, submissionID, "FAILED", "", submitErr.Error())
				return fmt.Errorf("rtgs: both ISO20022 and MT202 failed: %w", submitErr)
			}
		}

		// ── Archive inbound ACK ───────────────────────────────────────────────
		if result.AckXML != "" {
			archiveMsg(ctx, pool, log, submissionID, "INBOUND", "pacs.002", result.AckXML)
		}

		// ── Mark ACKNOWLEDGED ─────────────────────────────────────────────────
		updateSubmissionStatus(ctx, pool, log, submissionID, "ACKNOWLEDGED", result.RTGSReference, "")

		// ── Update intraday liquidity positions per DFSP ──────────────────────
		for _, p := range evt.Positions {
			_, posErr := pool.Exec(ctx, `
				INSERT INTO cb_liquidity_positions (
					id, tenant_id, dfsp_id, settlement_window_id, currency,
					opening_balance_kobo, settled_kobo, pending_kobo,
					rtgs_submission_count, last_rtgs_ref, position_date, created_at, updated_at
				) VALUES ($1,$2,$3,$4,$5,0,$6,0,1,$7,NOW(),NOW(),NOW())
				ON CONFLICT (dfsp_id, settlement_window_id, currency) DO UPDATE SET
					settled_kobo          = cb_liquidity_positions.settled_kobo + EXCLUDED.settled_kobo,
					rtgs_submission_count = cb_liquidity_positions.rtgs_submission_count + 1,
					last_rtgs_ref         = EXCLUDED.last_rtgs_ref,
					updated_at            = NOW()`,
				uuid.New().String(), tenantID, p.DFSPID, evt.WindowID, evt.Currency,
				p.NetAmountKobo, result.RTGSReference,
			)
			if posErr != nil {
				log.Error("db.upsert_position_failed",
					zap.String("dfsp_id", p.DFSPID),
					zap.Error(posErr),
				)
			}
		}

		// ── Mark Redis idempotency (7 days) ───────────────────────────────────
		rdb.Set(ctx, idempotencyKey, result.RTGSReference, 7*24*time.Hour)

		log.Info("rtgs.submitted",
			zap.String("submission_id", submissionID),
			zap.String("window_id", evt.WindowID),
			zap.String("msg_id", msgID),
			zap.String("rtgs_ref", result.RTGSReference),
			zap.String("status", result.Status),
		)

		return nil
	}
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

func archiveMsg(ctx context.Context, pool *pgxpool.Pool, log *zap.Logger,
	submissionID, direction, msgType, rawXML string) {
	_, err := pool.Exec(ctx, `
		INSERT INTO rtgs_messages (id, submission_id, direction, message_type, raw_xml, checksum, created_at)
		VALUES ($1,$2,$3,$4,$5,encode(sha256($5::bytea),'hex'),NOW())`,
		uuid.New().String(), submissionID, direction, msgType, rawXML,
	)
	if err != nil {
		log.Warn("db.archive_msg_failed", zap.Error(err))
	}
}

func updateSubmissionStatus(ctx context.Context, pool *pgxpool.Pool, log *zap.Logger,
	id, status, rtgsRef, rejectReason string) {
	var err error
	switch status {
	case "SUBMITTED":
		_, err = pool.Exec(ctx,
			`UPDATE rtgs_submissions SET status=$1, submitted_at=NOW(), updated_at=NOW() WHERE id=$2`,
			status, id)
	case "ACKNOWLEDGED":
		_, err = pool.Exec(ctx,
			`UPDATE rtgs_submissions SET status=$1, rtgs_reference=$2, acknowledged_at=NOW(), updated_at=NOW() WHERE id=$3`,
			status, rtgsRef, id)
	case "SETTLED":
		_, err = pool.Exec(ctx,
			`UPDATE rtgs_submissions SET status=$1, settled_at=NOW(), updated_at=NOW() WHERE id=$2`,
			status, id)
	case "REJECTED", "FAILED":
		_, err = pool.Exec(ctx,
			`UPDATE rtgs_submissions SET status=$1, rejected_at=NOW(), rejection_reason=$2, updated_at=NOW() WHERE id=$3`,
			status, rejectReason, id)
	default:
		_, err = pool.Exec(ctx,
			`UPDATE rtgs_submissions SET status=$1, updated_at=NOW() WHERE id=$2`,
			status, id)
	}
	if err != nil {
		log.Warn("db.update_submission_status_failed", zap.String("status", status), zap.Error(err))
	}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required env var %s is not set", key))
	}
	return v
}

func splitEnv(key, fallback string) []string {
	v := getEnv(key, fallback)
	var result []string
	start := 0
	for i, c := range v {
		if c == ',' {
			result = append(result, v[start:i])
			start = i + 1
		}
	}
	result = append(result, v[start:])
	return result
}
