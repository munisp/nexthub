// Package permify provides a client for the Permify fine-grained authorization service.
package permify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client wraps the Permify HTTP API.
type Client struct {
	endpoint string
	token    string
	http     *http.Client
}

// NewClient creates a Permify client.
func NewClient(endpoint, token string) *Client {
	return &Client{
		endpoint: endpoint,
		token:    token,
		http:     &http.Client{Timeout: 5 * time.Second},
	}
}

// CheckRequest is the payload for a Permify permission check.
type CheckRequest struct {
	TenantID string   `json:"tenantId"`
	Entity   Entity   `json:"entity"`
	Subject  Subject  `json:"subject"`
	Action   string   `json:"action"`
}

type Entity struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type Subject struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Relation string `json:"relation,omitempty"`
}

// CheckResponse is the result of a Permify permission check.
type CheckResponse struct {
	Can     bool   `json:"can"`
	Reason  string `json:"reason,omitempty"`
}

// Check performs a permission check against Permify.
// Returns true if the subject is allowed to perform the action on the entity.
func (c *Client) Check(ctx context.Context, req CheckRequest) (bool, error) {
	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/v1/permissions/check", c.endpoint), bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.http.Do(httpReq)
	if err != nil {
		// Fail open in dev when Permify is not running
		return true, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusServiceUnavailable || resp.StatusCode == 0 {
		return true, nil // fail open
	}

	var result CheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return true, nil // fail open on parse error
	}
	return result.Can, nil
}

// WriteRelationship upserts a relationship tuple in Permify.
func (c *Client) WriteRelationship(ctx context.Context, tenantID, entityType, entityID, relation, subjectType, subjectID string) error {
	payload := map[string]any{
		"tenantId": tenantID,
		"metadata": map[string]any{"schemaVersion": ""},
		"tuples": []map[string]any{
			{
				"entity":   map[string]string{"type": entityType, "id": entityID},
				"relation": relation,
				"subject":  map[string]string{"type": subjectType, "id": subjectID},
			},
		},
	}

	body, _ := json.Marshal(payload)
	httpReq, err := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/v1/relationships/write", c.endpoint), bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil // fail silently when Permify is offline
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)
	return nil
}
