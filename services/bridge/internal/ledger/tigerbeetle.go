// Package ledger provides a client for the TigerBeetle double-entry ledger
// via the Rust HTTP sidecar (services/ledger).
package ledger

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// Client communicates with the Rust TigerBeetle sidecar over HTTP.
type Client struct {
	baseURL string
	http    *http.Client
}

// NewClient creates a ledger client pointing at the Rust sidecar.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// ─── Account operations ───────────────────────────────────────────────────────

// CreateAccountRequest defines a new ledger account.
type CreateAccountRequest struct {
	ID             uint64 `json:"id"`
	UserData       uint64 `json:"user_data"`
	Ledger         uint32 `json:"ledger"`
	Code           uint16 `json:"code"`
	Flags          uint16 `json:"flags"`
}

// Account represents a TigerBeetle account with balance.
type Account struct {
	ID             uint64 `json:"id"`
	CreditsPosted  uint64 `json:"credits_posted"`
	DebitsPosted   uint64 `json:"debits_posted"`
	CreditsPending uint64 `json:"credits_pending"`
	DebitsPending  uint64 `json:"debits_pending"`
	Ledger         uint32 `json:"ledger"`
	Code           uint16 `json:"code"`
}

func (a *Account) Balance() int64 {
	return int64(a.CreditsPosted) - int64(a.DebitsPosted)
}

// CreateAccount creates a new account in the ledger.
func (c *Client) CreateAccount(ctx context.Context, req CreateAccountRequest) error {
	return c.post(ctx, "/accounts", req, nil)
}

// LookupAccount retrieves an account by ID.
func (c *Client) LookupAccount(ctx context.Context, id uint64) (*Account, error) {
	var acc Account
	if err := c.get(ctx, fmt.Sprintf("/accounts/%d", id), &acc); err != nil {
		return nil, err
	}
	return &acc, nil
}

// ─── Transfer operations ──────────────────────────────────────────────────────

// TransferRequest defines a double-entry transfer between two accounts.
type TransferRequest struct {
	ID              uint64 `json:"id"`
	DebitAccountID  uint64 `json:"debit_account_id"`
	CreditAccountID uint64 `json:"credit_account_id"`
	Amount          uint64 `json:"amount"`
	Ledger          uint32 `json:"ledger"`
	Code            uint16 `json:"code"`
	Flags           uint16 `json:"flags"`
	UserData        uint64 `json:"user_data"`
	Timeout         uint64 `json:"timeout,omitempty"` // nanoseconds; non-zero = pending
}

// TransferResult is returned after a transfer is committed.
type TransferResult struct {
	ID     uint64 `json:"id"`
	Result string `json:"result"` // "ok" | "error_code"
}

// CreateTransfer creates an immediate or pending (two-phase) transfer.
func (c *Client) CreateTransfer(ctx context.Context, req TransferRequest) (*TransferResult, error) {
	var result TransferResult
	if err := c.post(ctx, "/transfers", req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ReserveTransfer creates a pending (two-phase) transfer that must be committed or voided.
func (c *Client) ReserveTransfer(ctx context.Context, req TransferRequest) (*TransferResult, error) {
	req.Flags = 1 << 0 // TigerBeetle: linked flag for pending
	req.Timeout = uint64(30 * time.Second)
	return c.CreateTransfer(ctx, req)
}

// CommitTransfer commits a previously reserved (pending) transfer.
func (c *Client) CommitTransfer(ctx context.Context, pendingID uint64, amount uint64) (*TransferResult, error) {
	payload := map[string]any{
		"pending_id": pendingID,
		"amount":     amount,
		"flags":      1 << 1, // post_pending_transfer
	}
	var result TransferResult
	if err := c.post(ctx, "/transfers/commit", payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// VoidTransfer voids a previously reserved (pending) transfer.
func (c *Client) VoidTransfer(ctx context.Context, pendingID uint64) (*TransferResult, error) {
	payload := map[string]any{
		"pending_id": pendingID,
		"flags":      1 << 2, // void_pending_transfer
	}
	var result TransferResult
	if err := c.post(ctx, "/transfers/void", payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *Client) post(ctx context.Context, path string, body, out any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, "POST", c.baseURL+path, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("ledger sidecar unreachable (%s): %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ledger sidecar error %d on %s", resp.StatusCode, path)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("ledger sidecar unreachable (%s): %w", path, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return fmt.Errorf("account not found")
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("ledger sidecar error %d on %s", resp.StatusCode, path)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}
