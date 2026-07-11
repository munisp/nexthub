// Package rtgs implements the secure connector between NextHub and the
// Central Bank's RTGS system. It supports two modes:
//   - ISO 20022 REST/HTTPS (modern CBN RTGS gateway)
//   - SWIFT MT202 FileAct (legacy fallback via SWIFT Alliance Lite2)
//
// The connector is stateless; all state is persisted in PostgreSQL and
// communicated via Kafka events.
package rtgs

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"go.uber.org/zap"
)

// ─── Config ──────────────────────────────────────────────────────────────────

type Config struct {
	// ISO 20022 REST endpoint (modern CBN gateway)
	ISO20022Endpoint string
	ISO20022APIKey   string

	// SWIFT FileAct credentials (legacy fallback)
	SWIFTFileActEndpoint string
	SWIFTCertFile        string
	SWIFTKeyFile         string
	SWIFTCAFile          string

	// Hub identity
	HubBIC               string
	HubSettlementAccount string
	HubSenderBIC         string

	// Timeouts
	SubmitTimeout time.Duration
	PollInterval  time.Duration
	MaxRetries    int
}

// ─── SubmitResult ─────────────────────────────────────────────────────────────

type SubmitResult struct {
	MessageID     string
	Status        string // ACCEPTED, REJECTED, PENDING
	RTGSReference string
	Timestamp     time.Time
	RawResponse   string
}

// ─── RTGSConnector ────────────────────────────────────────────────────────────

type RTGSConnector struct {
	cfg    Config
	log    *zap.Logger
	client *http.Client
}

func NewRTGSConnector(cfg Config, log *zap.Logger) (*RTGSConnector, error) {
	tlsCfg := &tls.Config{MinVersion: tls.VersionTLS12}

	// Load mutual TLS certificates for SWIFT FileAct if provided
	if cfg.SWIFTCertFile != "" && cfg.SWIFTKeyFile != "" {
		cert, err := tls.LoadX509KeyPair(cfg.SWIFTCertFile, cfg.SWIFTKeyFile)
		if err != nil {
			return nil, fmt.Errorf("rtgs: load client cert: %w", err)
		}
		tlsCfg.Certificates = []tls.Certificate{cert}
	}

	// Load CA bundle for CBN gateway
	if cfg.SWIFTCAFile != "" {
		caPEM, err := os.ReadFile(cfg.SWIFTCAFile)
		if err != nil {
			return nil, fmt.Errorf("rtgs: read CA file: %w", err)
		}
		pool := x509.NewCertPool()
		pool.AppendCertsFromPEM(caPEM)
		tlsCfg.RootCAs = pool
	}

	client := &http.Client{
		Timeout:   cfg.SubmitTimeout,
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}

	return &RTGSConnector{cfg: cfg, log: log, client: client}, nil
}

// ─── SubmitISO20022 sends a pacs.009 XML message to the CBN REST gateway ─────

func (c *RTGSConnector) SubmitISO20022(ctx context.Context, msgID string, xmlPayload []byte) (*SubmitResult, error) {
	c.log.Info("rtgs.submit_iso20022",
		zap.String("msg_id", msgID),
		zap.Int("payload_bytes", len(xmlPayload)),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.ISO20022Endpoint+"/pacs.009", bytes.NewReader(xmlPayload))
	if err != nil {
		return nil, fmt.Errorf("rtgs: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/xml")
	req.Header.Set("X-API-Key", c.cfg.ISO20022APIKey)
	req.Header.Set("X-Message-ID", msgID)
	req.Header.Set("X-Sender-BIC", c.cfg.HubBIC)

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("rtgs: http submit: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		c.log.Error("rtgs.submit_rejected",
			zap.String("msg_id", msgID),
			zap.Int("status_code", resp.StatusCode),
			zap.String("body", string(body)),
		)
		return &SubmitResult{
			MessageID:   msgID,
			Status:      "REJECTED",
			Timestamp:   time.Now(),
			RawResponse: string(body),
		}, fmt.Errorf("rtgs: gateway rejected message (HTTP %d)", resp.StatusCode)
	}

	// Parse the CBN gateway acknowledgement
	var ack struct {
		Status    string `json:"status"`
		Reference string `json:"rtgs_reference"`
	}
	if err := json.Unmarshal(body, &ack); err != nil {
		// Some CBN gateways return XML ack — treat as PENDING
		c.log.Warn("rtgs.ack_parse_failed", zap.String("body", string(body)))
		return &SubmitResult{
			MessageID:   msgID,
			Status:      "PENDING",
			Timestamp:   time.Now(),
			RawResponse: string(body),
		}, nil
	}

	c.log.Info("rtgs.submit_accepted",
		zap.String("msg_id", msgID),
		zap.String("rtgs_ref", ack.Reference),
		zap.String("status", ack.Status),
	)

	return &SubmitResult{
		MessageID:     msgID,
		Status:        ack.Status,
		RTGSReference: ack.Reference,
		Timestamp:     time.Now(),
		RawResponse:   string(body),
	}, nil
}

// ─── SubmitMT202 sends a SWIFT MT202 message via FileAct (legacy fallback) ───

func (c *RTGSConnector) SubmitMT202(ctx context.Context, mt202Text string, transactionRef string) (*SubmitResult, error) {
	c.log.Info("rtgs.submit_mt202", zap.String("ref", transactionRef))

	payload := map[string]string{
		"message_type": "MT202",
		"content":      mt202Text,
		"sender_bic":   c.cfg.HubSenderBIC,
	}
	body, _ := json.Marshal(payload)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.SWIFTFileActEndpoint+"/fileact/submit", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("rtgs: build mt202 request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("rtgs: mt202 submit: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return &SubmitResult{
			MessageID:   transactionRef,
			Status:      "REJECTED",
			Timestamp:   time.Now(),
			RawResponse: string(respBody),
		}, fmt.Errorf("rtgs: mt202 rejected (HTTP %d)", resp.StatusCode)
	}

	return &SubmitResult{
		MessageID:   transactionRef,
		Status:      "ACCEPTED",
		Timestamp:   time.Now(),
		RawResponse: string(respBody),
	}, nil
}

// ─── PollStatus polls the CBN gateway for the final settlement status ─────────

func (c *RTGSConnector) PollStatus(ctx context.Context, rtgsReference string) (string, error) {
	url := fmt.Sprintf("%s/settlement-status/%s", c.cfg.ISO20022Endpoint, rtgsReference)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-API-Key", c.cfg.ISO20022APIKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Status string `json:"status"` // SETTLED, FAILED, PENDING
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "UNKNOWN", nil
	}
	return result.Status, nil
}
