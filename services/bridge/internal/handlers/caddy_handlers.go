// caddy_handlers.go — Caddy Admin API relay handlers for the NextHub bridge.
//
// These handlers allow the NextHub portal (via tRPC → Bridge) to manage
// the Caddy edge proxy at runtime:
//   - Register per-tenant reverse-proxy routes when a DFSP onboards
//   - Update upstream addresses during rolling deployments
//   - Add TLS automation policies for new custom domains
//   - Query the current Caddy configuration
//   - Ping the Caddy Admin API for health checks
package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/munisp/nexthub/bridge/internal/caddy"
	"go.uber.org/zap"
)

// ─── Request / Response types ─────────────────────────────────────────────────

type caddyRouteReq struct {
	// ServerName is the Caddy HTTP server name (default: "srv0")
	ServerName string `json:"serverName"`
	// RouteID is a unique identifier for the route (used for updates/deletes)
	RouteID string `json:"routeId" binding:"required"`
	// Hosts is the list of hostnames this route matches
	Hosts []string `json:"hosts" binding:"required"`
	// PathPrefix is an optional path prefix matcher (e.g. "/api/v1")
	PathPrefix string `json:"pathPrefix"`
	// UpstreamDial is the upstream address (e.g. "nexthub:3001")
	UpstreamDial string `json:"upstreamDial" binding:"required"`
	// Terminal stops route evaluation after this route matches
	Terminal bool `json:"terminal"`
}

type caddyUpstreamReq struct {
	// RouteID is the @id of the route whose upstream should be updated
	RouteID string `json:"routeId" binding:"required"`
	// Upstreams is the new list of upstream dial addresses
	Upstreams []string `json:"upstreams" binding:"required"`
}

type caddyTLSPolicyReq struct {
	// Subjects is the list of domains to add TLS automation for
	Subjects []string `json:"subjects" binding:"required"`
	// ACMEEmail overrides the global ACME email for this policy
	ACMEEmail string `json:"acmeEmail"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// GetCaddyConfig returns the current full Caddy configuration.
func (h *Handler) GetCaddyConfig(c *gin.Context) {
	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	cfg, err := client.GetConfig(c.Request.Context())
	if err != nil {
		h.Log.Warn("caddy_get_config_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"available": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"available": true, "config": cfg})
}

// PingCaddy checks whether the Caddy Admin API is reachable.
func (h *Handler) PingCaddy(c *gin.Context) {
	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	if err := client.Ping(c.Request.Context()); err != nil {
		h.Log.Warn("caddy_ping_failed", zap.Error(err))
		c.JSON(http.StatusOK, gin.H{"healthy": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"healthy": true})
}

// UpsertCaddyRoute adds or replaces a reverse-proxy route in Caddy.
// This is called when a new tenant domain is provisioned.
func (h *Handler) UpsertCaddyRoute(c *gin.Context) {
	var req caddyRouteReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	serverName := req.ServerName
	if serverName == "" {
		serverName = "srv0"
	}

	// Build the match block
	matchBlock := map[string]any{
		"host": req.Hosts,
	}
	if req.PathPrefix != "" {
		matchBlock["path"] = []string{req.PathPrefix + "*"}
	}

	// Build the reverse_proxy handler
	upstreams := []map[string]any{
		{"dial": req.UpstreamDial},
	}
	handleBlock := map[string]any{
		"handler":   "reverse_proxy",
		"upstreams": upstreams,
		"headers": map[string]any{
			"request": map[string]any{
				"set": map[string][]string{
					"X-Forwarded-Proto": {"https"},
					"X-Real-IP":         {"{http.request.remote.host}"},
				},
			},
		},
	}

	route := caddy.RouteConfig{
		ID:       req.RouteID,
		Match:    []map[string]any{matchBlock},
		Handle:   []map[string]any{handleBlock},
		Terminal: req.Terminal,
	}

	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	if err := client.UpsertRoute(c.Request.Context(), serverName, route); err != nil {
		h.Log.Warn("caddy_route_upsert_failed", zap.Error(err), zap.String("routeId", req.RouteID))
		c.JSON(http.StatusOK, gin.H{"upserted": false, "routeId": req.RouteID, "error": err.Error()})
		return
	}

	h.Log.Info("caddy_route_upserted",
		zap.String("routeId", req.RouteID),
		zap.Strings("hosts", req.Hosts),
		zap.String("upstream", req.UpstreamDial),
	)
	c.JSON(http.StatusOK, gin.H{"upserted": true, "routeId": req.RouteID})
}

// DeleteCaddyRoute removes a route from Caddy by its @id.
func (h *Handler) DeleteCaddyRoute(c *gin.Context) {
	routeID := c.Param("routeId")
	if routeID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "routeId is required"})
		return
	}

	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	if err := client.DeleteRoute(c.Request.Context(), routeID); err != nil {
		h.Log.Warn("caddy_route_delete_failed", zap.Error(err), zap.String("routeId", routeID))
		c.JSON(http.StatusOK, gin.H{"deleted": false, "routeId": routeID, "error": err.Error()})
		return
	}

	h.Log.Info("caddy_route_deleted", zap.String("routeId", routeID))
	c.JSON(http.StatusOK, gin.H{"deleted": true, "routeId": routeID})
}

// UpdateCaddyUpstream replaces the upstream dial addresses for a named route.
// Used during rolling deployments to point Caddy at a new container.
func (h *Handler) UpdateCaddyUpstream(c *gin.Context) {
	var req caddyUpstreamReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	upstreams := make([]caddy.UpstreamConfig, len(req.Upstreams))
	for i, dial := range req.Upstreams {
		upstreams[i] = caddy.UpstreamConfig{Dial: dial}
	}

	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	if err := client.UpdateUpstream(c.Request.Context(), req.RouteID, upstreams); err != nil {
		h.Log.Warn("caddy_upstream_update_failed", zap.Error(err), zap.String("routeId", req.RouteID))
		c.JSON(http.StatusOK, gin.H{"updated": false, "routeId": req.RouteID, "error": err.Error()})
		return
	}

	h.Log.Info("caddy_upstream_updated",
		zap.String("routeId", req.RouteID),
		zap.Strings("upstreams", req.Upstreams),
	)
	c.JSON(http.StatusOK, gin.H{"updated": true, "routeId": req.RouteID})
}

// AddCaddyTLSPolicy adds a TLS automation policy for a new custom domain.
// Caddy will automatically obtain and renew a certificate for the domain.
func (h *Handler) AddCaddyTLSPolicy(c *gin.Context) {
	var req caddyTLSPolicyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	policy := caddy.TLSAutomationPolicy{
		Subjects: req.Subjects,
	}
	if req.ACMEEmail != "" {
		policy.Issuers = []map[string]any{
			{
				"module": "acme",
				"email":  req.ACMEEmail,
			},
		}
	}

	client := caddy.New(envOrDefault("CADDY_ADMIN_URL", "http://caddy:2019"))
	if err := client.AddTLSPolicy(c.Request.Context(), policy); err != nil {
		h.Log.Warn("caddy_tls_policy_add_failed", zap.Error(err), zap.Strings("subjects", req.Subjects))
		c.JSON(http.StatusOK, gin.H{"added": false, "subjects": req.Subjects, "error": err.Error()})
		return
	}

	h.Log.Info("caddy_tls_policy_added", zap.Strings("subjects", req.Subjects))
	c.JSON(http.StatusOK, gin.H{"added": true, "subjects": req.Subjects})
}
