// Package caddy provides a client for the Caddy Admin API.
//
// The Caddy Admin API (default :2019) allows programmatic management of
// Caddy's configuration at runtime — adding/removing routes, updating
// upstream addresses, and reloading TLS certificates — without restarting
// the process.
//
// NextHub uses this client to:
//   - Register per-tenant reverse-proxy routes when a new DFSP or partner onboards
//   - Update upstream addresses during rolling deployments
//   - Trigger TLS certificate reload after domain changes
//   - Query the current Caddy config for health dashboards
package caddy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client is a thin wrapper around the Caddy Admin API.
type Client struct {
	baseURL string
	http    *http.Client
}

// New creates a new Caddy Admin API client.
// baseURL defaults to http://caddy:2019 if empty.
func New(baseURL string) *Client {
	if baseURL == "" {
		baseURL = os.Getenv("CADDY_ADMIN_URL")
	}
	if baseURL == "" {
		baseURL = "http://caddy:2019"
	}
	return &Client{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 10 * time.Second},
	}
}

// ─── Config ───────────────────────────────────────────────────────────────────

// GetConfig retrieves the current full Caddy configuration.
func (c *Client) GetConfig(ctx context.Context) (map[string]any, error) {
	return c.get(ctx, "/config/")
}

// LoadConfig replaces the entire Caddy configuration with the provided JSON.
func (c *Client) LoadConfig(ctx context.Context, cfg map[string]any) error {
	return c.post(ctx, "/load", cfg)
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// RouteConfig describes a Caddy HTTP route for a tenant or service.
type RouteConfig struct {
	// ID is a unique identifier for the route (used for updates/deletes).
	ID string `json:"@id,omitempty"`
	// Match contains the list of matchers (host, path, etc.).
	Match []map[string]any `json:"match"`
	// Handle contains the list of handlers (reverse_proxy, static_response, etc.).
	Handle []map[string]any `json:"handle"`
	// Terminal stops route evaluation after this route matches.
	Terminal bool `json:"terminal,omitempty"`
}

// UpsertRoute adds or replaces a named route in the Caddy HTTP server config.
// The route is inserted at the given path in the config tree.
// path example: "apps/http/servers/srv0/routes"
func (c *Client) UpsertRoute(ctx context.Context, serverName string, route RouteConfig) error {
	path := fmt.Sprintf("/config/apps/http/servers/%s/routes", serverName)
	return c.patch(ctx, path, route)
}

// DeleteRoute removes a named route by its @id from the Caddy config.
func (c *Client) DeleteRoute(ctx context.Context, routeID string) error {
	return c.delete(ctx, fmt.Sprintf("/id/%s", routeID))
}

// ─── Upstreams ────────────────────────────────────────────────────────────────

// UpstreamConfig describes a single upstream dial address.
type UpstreamConfig struct {
	Dial string `json:"dial"`
}

// UpdateUpstream replaces the upstream dial address for a named reverse-proxy
// handler. This is used during rolling deployments to point Caddy at a new
// container without restarting.
func (c *Client) UpdateUpstream(ctx context.Context, routeID string, upstreams []UpstreamConfig) error {
	path := fmt.Sprintf("/id/%s/handle/0/upstreams", routeID)
	return c.patch(ctx, path, upstreams)
}

// ─── TLS ─────────────────────────────────────────────────────────────────────

// TLSAutomationPolicy describes a Caddy TLS automation policy.
type TLSAutomationPolicy struct {
	Subjects []string       `json:"subjects"`
	Issuers  []map[string]any `json:"issuers,omitempty"`
}

// AddTLSPolicy adds a TLS automation policy for a new domain.
// Caddy will automatically obtain and renew a certificate for the domain.
func (c *Client) AddTLSPolicy(ctx context.Context, policy TLSAutomationPolicy) error {
	return c.post(ctx, "/config/apps/tls/automation/policies", policy)
}

// ─── Health ───────────────────────────────────────────────────────────────────

// Ping checks whether the Caddy Admin API is reachable.
func (c *Client) Ping(ctx context.Context) error {
	_, err := c.get(ctx, "/config/")
	return err
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *Client) get(ctx context.Context, path string) (map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("caddy admin unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("caddy admin GET %s: status %d: %s", path, resp.StatusCode, body)
	}
	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

func (c *Client) post(ctx context.Context, path string, body any) error {
	return c.doJSON(ctx, "POST", path, body)
}

func (c *Client) patch(ctx context.Context, path string, body any) error {
	return c.doJSON(ctx, "PATCH", path, body)
}

func (c *Client) delete(ctx context.Context, path string) error {
	req, err := http.NewRequestWithContext(ctx, "DELETE", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("caddy admin unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("caddy admin DELETE %s: status %d: %s", path, resp.StatusCode, body)
	}
	return nil
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("caddy admin unreachable: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("caddy admin %s %s: status %d: %s", method, path, resp.StatusCode, respBody)
	}
	return nil
}
