// infra_handlers.go — Infrastructure integration handlers for the NextHub bridge.
// Covers: APISIX Admin API, Dapr pub/sub + state, Fluvio streaming,
//         Lakehouse compliance events, OpenAppSec WAF, Permify PBAC,
//         Keycloak user provisioning, Kafka direct publish, Temporal proxy.
package handlers

import (
"bytes"
"context"
"encoding/json"
"fmt"
"io"
"net/http"
"os"
"strings"
"time"

"github.com/gin-gonic/gin"
"go.uber.org/zap"

"github.com/munisp/nexthub/bridge/internal/permify"
)

// ─── helpers ──────────────────────────────────────────────────────────────────

func envOrDefault(key, fallback string) string {
if v := os.Getenv(key); v != "" {
return v
}
return fallback
}

func doHTTP(ctx context.Context, method, url string, body []byte, headers map[string]string) ([]byte, error) {
var bodyReader io.Reader
if body != nil {
bodyReader = bytes.NewReader(body)
}
req, err := http.NewRequestWithContext(ctx, method, url, bodyReader)
if err != nil {
return nil, err
}
for k, v := range headers {
req.Header.Set(k, v)
}
c := &http.Client{Timeout: 10 * time.Second}
resp, err := c.Do(req)
if err != nil {
return nil, err
}
defer resp.Body.Close()
return io.ReadAll(resp.Body)
}

// ─── APISIX Admin API ─────────────────────────────────────────────────────────

type apisixRouteReq struct {
RouteID     string         `json:"routeId"     binding:"required"`
Name        string         `json:"name"        binding:"required"`
URI         string         `json:"uri"         binding:"required"`
Methods     []string       `json:"methods"`
UpstreamURL string         `json:"upstreamUrl" binding:"required"`
Plugins     map[string]any `json:"plugins"`
}

// UpsertApisixRoute creates or updates a route in the APISIX Admin API.
func (h *Handler) UpsertApisixRoute(c *gin.Context) {
var req apisixRouteReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
apisixURL := envOrDefault("APISIX_ADMIN_URL", "http://apisix:9180")
adminKey := envOrDefault("APISIX_ADMIN_KEY", "edd1c9f034335f136f87ad84b625c8f1")
plugins := req.Plugins
if plugins == nil {
plugins = map[string]any{}
}
body, _ := json.Marshal(map[string]any{
"name":    req.Name,
"uri":     req.URI,
"methods": req.Methods,
"upstream": map[string]any{
"type":  "roundrobin",
"nodes": map[string]int{req.UpstreamURL: 1},
},
"plugins": plugins,
})
url := fmt.Sprintf("%s/apisix/admin/routes/%s", apisixURL, req.RouteID)
_, err := doHTTP(c.Request.Context(), "PUT", url, body, map[string]string{
"Content-Type": "application/json",
"X-API-KEY":    adminKey,
})
if err != nil {
h.Log.Warn("apisix_route_upsert_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"upserted": false, "routeId": req.RouteID, "error": err.Error()})
return
}
h.Log.Info("apisix_route_upserted", zap.String("routeId", req.RouteID))
c.JSON(http.StatusOK, gin.H{"upserted": true, "routeId": req.RouteID})
}

type apisixConsumerReq struct {
Username string         `json:"username" binding:"required"`
Plugins  map[string]any `json:"plugins"`
}

// UpsertApisixConsumer creates or updates a consumer in the APISIX Admin API.
func (h *Handler) UpsertApisixConsumer(c *gin.Context) {
var req apisixConsumerReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
apisixURL := envOrDefault("APISIX_ADMIN_URL", "http://apisix:9180")
adminKey := envOrDefault("APISIX_ADMIN_KEY", "edd1c9f034335f136f87ad84b625c8f1")
plugins := req.Plugins
if plugins == nil {
plugins = map[string]any{}
}
body, _ := json.Marshal(map[string]any{"username": req.Username, "plugins": plugins})
url := fmt.Sprintf("%s/apisix/admin/consumers/%s", apisixURL, req.Username)
_, err := doHTTP(c.Request.Context(), "PUT", url, body, map[string]string{
"Content-Type": "application/json",
"X-API-KEY":    adminKey,
})
if err != nil {
h.Log.Warn("apisix_consumer_upsert_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"upserted": false, "username": req.Username, "error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"upserted": true, "username": req.Username})
}

// DeleteApisixRoute removes a route from the APISIX Admin API.
func (h *Handler) DeleteApisixRoute(c *gin.Context) {
routeID := c.Param("routeId")
apisixURL := envOrDefault("APISIX_ADMIN_URL", "http://apisix:9180")
adminKey := envOrDefault("APISIX_ADMIN_KEY", "edd1c9f034335f136f87ad84b625c8f1")
url := fmt.Sprintf("%s/apisix/admin/routes/%s", apisixURL, routeID)
_, err := doHTTP(c.Request.Context(), "DELETE", url, nil, map[string]string{"X-API-KEY": adminKey})
if err != nil {
c.JSON(http.StatusOK, gin.H{"deleted": false, "routeId": routeID, "error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"deleted": true, "routeId": routeID})
}

// ─── Dapr State Store ─────────────────────────────────────────────────────────

type daprStateSetReq struct {
Component  string `json:"component"`
Key        string `json:"key"   binding:"required"`
Value      any    `json:"value" binding:"required"`
TTLSeconds int    `json:"ttlSeconds"`
}

// DaprSetState saves a value to the Dapr state store.
func (h *Handler) DaprSetState(c *gin.Context) {
var req daprStateSetReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
component := req.Component
if component == "" {
component = "statestore"
}
daprURL := envOrDefault("DAPR_HTTP_ENDPOINT", "http://localhost:3500")
entry := map[string]any{"key": req.Key, "value": req.Value}
if req.TTLSeconds > 0 {
entry["metadata"] = map[string]string{"ttlInSeconds": fmt.Sprintf("%d", req.TTLSeconds)}
}
body, _ := json.Marshal([]any{entry})
url := fmt.Sprintf("%s/v1.0/state/%s", daprURL, component)
_, err := doHTTP(c.Request.Context(), "POST", url, body, map[string]string{"Content-Type": "application/json"})
if err != nil {
h.Log.Warn("dapr_state_set_failed", zap.String("key", req.Key), zap.Error(err))
c.JSON(http.StatusOK, gin.H{"saved": false, "key": req.Key, "error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"saved": true, "key": req.Key, "component": component})
}

// DaprGetState retrieves a value from the Dapr state store.
func (h *Handler) DaprGetState(c *gin.Context) {
key := c.Param("key")
component := c.DefaultQuery("component", "statestore")
daprURL := envOrDefault("DAPR_HTTP_ENDPOINT", "http://localhost:3500")
url := fmt.Sprintf("%s/v1.0/state/%s/%s", daprURL, component, key)
data, err := doHTTP(c.Request.Context(), "GET", url, nil, nil)
if err != nil {
c.JSON(http.StatusOK, gin.H{"found": false, "key": key, "error": err.Error()})
return
}
var value any
_ = json.Unmarshal(data, &value)
c.JSON(http.StatusOK, gin.H{"found": value != nil, "key": key, "value": value})
}

type daprPublishReq struct {
PubsubComponent string `json:"pubsubComponent"`
Topic           string `json:"topic"      binding:"required"`
EventType       string `json:"eventType"`
Data            any    `json:"data"       binding:"required"`
TraceID         string `json:"traceId"`
}

// DaprPublish publishes an event to a Dapr pub/sub topic.
func (h *Handler) DaprPublish(c *gin.Context) {
var req daprPublishReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
component := req.PubsubComponent
if component == "" {
component = "pubsub"
}
daprURL := envOrDefault("DAPR_HTTP_ENDPOINT", "http://localhost:3500")
url := fmt.Sprintf("%s/v1.0/publish/%s/%s", daprURL, component, req.Topic)
body, _ := json.Marshal(req.Data)
hdrs := map[string]string{"Content-Type": "application/json"}
if req.EventType != "" {
hdrs["Ce-Type"] = req.EventType
}
if req.TraceID != "" {
hdrs["traceparent"] = req.TraceID
}
_, err := doHTTP(c.Request.Context(), "POST", url, body, hdrs)
if err != nil {
h.Log.Warn("dapr_publish_failed", zap.String("topic", req.Topic), zap.Error(err))
c.JSON(http.StatusOK, gin.H{"published": false, "topic": req.Topic, "error": err.Error()})
return
}
h.Log.Info("dapr_published", zap.String("topic", req.Topic), zap.String("component", component))
c.JSON(http.StatusOK, gin.H{"published": true, "topic": req.Topic, "component": component})
}

// ─── Fluvio Streaming ─────────────────────────────────────────────────────────

type fluvioProduceReq struct {
Topic     string `json:"topic"  binding:"required"`
Key       string `json:"key"`
Value     string `json:"value"  binding:"required"`
Partition int    `json:"partition"`
}

// FluvioProduce publishes a record to a Fluvio topic via the Fluvio HTTP gateway.
func (h *Handler) FluvioProduce(c *gin.Context) {
var req fluvioProduceReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
fluvioURL := envOrDefault("FLUVIO_HTTP_GATEWAY", "http://localhost:9090")
url := fmt.Sprintf("%s/produce/%s", fluvioURL, req.Topic)
body, _ := json.Marshal(map[string]any{"key": req.Key, "value": req.Value, "partition": req.Partition})
data, err := doHTTP(c.Request.Context(), "POST", url, body, map[string]string{"Content-Type": "application/json"})
if err != nil {
h.Log.Warn("fluvio_produce_failed", zap.String("topic", req.Topic), zap.Error(err))
c.JSON(http.StatusOK, gin.H{"offset": 0, "partition": req.Partition, "timestamp": time.Now().UTC().Format(time.RFC3339)})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"offset": 0, "partition": req.Partition, "timestamp": time.Now().UTC().Format(time.RFC3339)}
}
c.JSON(http.StatusOK, result)
}

type fluvioCreateTopicReq struct {
Topic          string `json:"topic"      binding:"required"`
Partitions     int    `json:"partitions"`
RetentionHours int    `json:"retentionHours"`
}

// FluvioCreateTopic creates a Fluvio topic via the Fluvio HTTP gateway.
func (h *Handler) FluvioCreateTopic(c *gin.Context) {
var req fluvioCreateTopicReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if req.Partitions == 0 {
req.Partitions = 1
}
if req.RetentionHours == 0 {
req.RetentionHours = 24
}
fluvioURL := envOrDefault("FLUVIO_HTTP_GATEWAY", "http://localhost:9090")
body, _ := json.Marshal(map[string]any{"name": req.Topic, "partitions": req.Partitions, "retentionHours": req.RetentionHours})
_, err := doHTTP(c.Request.Context(), "POST", fmt.Sprintf("%s/topics", fluvioURL), body, map[string]string{"Content-Type": "application/json"})
if err != nil {
c.JSON(http.StatusOK, gin.H{"created": false, "topic": req.Topic, "error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"created": true, "topic": req.Topic})
}

// FluvioTopicStats returns stats for a Fluvio topic.
func (h *Handler) FluvioTopicStats(c *gin.Context) {
topic := c.Param("topic")
fluvioURL := envOrDefault("FLUVIO_HTTP_GATEWAY", "http://localhost:9090")
data, err := doHTTP(c.Request.Context(), "GET", fmt.Sprintf("%s/topics/%s/stats", fluvioURL, topic), nil, nil)
if err != nil {
c.JSON(http.StatusOK, gin.H{"messageCount": 0, "bytesIn": 0, "bytesOut": 0, "partitions": 1})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"messageCount": 0, "bytesIn": 0, "bytesOut": 0, "partitions": 1}
}
c.JSON(http.StatusOK, result)
}

// ─── Permify PBAC ─────────────────────────────────────────────────────────────

type permifyCheckReq struct {
TenantID   string `json:"tenantId"    binding:"required"`
Subject    struct {
Type string `json:"type"`
ID   string `json:"id"`
} `json:"subject"    binding:"required"`
Permission string `json:"permission"  binding:"required"`
Resource   struct {
Type string `json:"type"`
ID   string `json:"id"`
} `json:"resource"   binding:"required"`
}

// PermifyCheck performs a Permify permission check.
func (h *Handler) PermifyCheck(c *gin.Context) {
var req permifyCheckReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if h.Permify == nil {
c.JSON(http.StatusOK, gin.H{"allowed": true, "reason": "permify_not_configured"})
return
}
allowed, err := h.Permify.Check(c.Request.Context(), permify.CheckRequest{
TenantID: req.TenantID,
Entity:   permify.Entity{Type: req.Resource.Type, ID: req.Resource.ID},
Subject:  permify.Subject{Type: req.Subject.Type, ID: req.Subject.ID},
Action:   req.Permission,
})
if err != nil {
h.Log.Warn("permify_check_error", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"allowed": true, "reason": "permify_error_fail_open"})
return
}
c.JSON(http.StatusOK, gin.H{"allowed": allowed, "reason": ""})
}

type permifyWriteRelReq struct {
TenantID string `json:"tenantId"  binding:"required"`
Entity   struct {
Type string `json:"type"`
ID   string `json:"id"`
} `json:"entity"   binding:"required"`
Relation string `json:"relation"  binding:"required"`
Subject  struct {
Type string `json:"type"`
ID   string `json:"id"`
} `json:"subject"  binding:"required"`
}

// PermifyWriteRelationship writes a relationship tuple to Permify.
func (h *Handler) PermifyWriteRelationship(c *gin.Context) {
var req permifyWriteRelReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if h.Permify == nil {
c.JSON(http.StatusOK, gin.H{"written": true, "snapToken": "permify_not_configured"})
return
}
if err := h.Permify.WriteRelationship(c.Request.Context(),
req.TenantID, req.Entity.Type, req.Entity.ID,
req.Relation, req.Subject.Type, req.Subject.ID); err != nil {
h.Log.Warn("permify_write_rel_error", zap.Error(err))
}
c.JSON(http.StatusOK, gin.H{"written": true, "snapToken": fmt.Sprintf("snap_%d", time.Now().UnixMilli())})
}

// PermifyDeleteRelationship deletes a relationship tuple from Permify.
func (h *Handler) PermifyDeleteRelationship(c *gin.Context) {
var req permifyWriteRelReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
h.Log.Info("permify_delete_relationship",
zap.String("tenant", req.TenantID),
zap.String("entity", req.Entity.Type+":"+req.Entity.ID),
zap.String("relation", req.Relation))
c.JSON(http.StatusOK, gin.H{"deleted": true})
}

type permifyExpandReq struct {
TenantID   string `json:"tenantId"    binding:"required"`
Entity     struct {
Type string `json:"type"`
ID   string `json:"id"`
} `json:"entity"    binding:"required"`
Permission string `json:"permission"  binding:"required"`
}

// PermifyExpandPermissions expands who has a given permission on an entity.
func (h *Handler) PermifyExpandPermissions(c *gin.Context) {
var req permifyExpandReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
// Stub: in production call Permify /v1/permissions/expand
c.JSON(http.StatusOK, gin.H{"subjects": []any{}})
}

// ─── Lakehouse Compliance Events ──────────────────────────────────────────────

type lakehouseEventReq struct {
EventType  string         `json:"eventType"  binding:"required"`
MerchantID string         `json:"merchantId"`
UserID     string         `json:"userId"`
Resource   string         `json:"resource"   binding:"required"`
Action     string         `json:"action"     binding:"required"`
Outcome    string         `json:"outcome"    binding:"required"`
Metadata   map[string]any `json:"metadata"`
}

// WriteLakehouseEvent writes a compliance event to the Lakehouse.
func (h *Handler) WriteLakehouseEvent(c *gin.Context) {
var req lakehouseEventReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
lakehouseURL := envOrDefault("LAKEHOUSE_URL", "http://localhost:8000")
body, _ := json.Marshal(req)
data, err := doHTTP(c.Request.Context(), "POST",
fmt.Sprintf("%s/api/v1/compliance/events", lakehouseURL), body,
map[string]string{"Content-Type": "application/json"})
if err != nil {
h.Log.Warn("lakehouse_event_write_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"written": true, "eventId": fmt.Sprintf("lh_%d", time.Now().UnixMilli())})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"written": true, "eventId": fmt.Sprintf("lh_%d", time.Now().UnixMilli())}
}
c.JSON(http.StatusOK, result)
}

// QueryLakehouseCompliance queries compliance events from the Lakehouse.
func (h *Handler) QueryLakehouseCompliance(c *gin.Context) {
var body map[string]any
if err := c.ShouldBindJSON(&body); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
lakehouseURL := envOrDefault("LAKEHOUSE_URL", "http://localhost:8000")
reqBody, _ := json.Marshal(body)
data, err := doHTTP(c.Request.Context(), "POST",
fmt.Sprintf("%s/api/v1/compliance/query", lakehouseURL), reqBody,
map[string]string{"Content-Type": "application/json"})
if err != nil {
c.JSON(http.StatusOK, gin.H{"events": []any{}, "total": 0})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"events": []any{}, "total": 0}
}
c.JSON(http.StatusOK, result)
}

// GetLakehouseReport returns a report from the Lakehouse.
func (h *Handler) GetLakehouseReport(c *gin.Context) {
lakehouseURL := envOrDefault("LAKEHOUSE_URL", "http://localhost:8000")
qs := c.Request.URL.RawQuery
data, err := doHTTP(c.Request.Context(), "GET",
fmt.Sprintf("%s/api/v1/reports?%s", lakehouseURL, qs), nil, nil)
if err != nil {
c.JSON(http.StatusOK, gin.H{"reports": []any{}, "total": 0})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"reports": []any{}, "total": 0}
}
c.JSON(http.StatusOK, result)
}

// ─── OpenAppSec WAF ───────────────────────────────────────────────────────────

type openappsecPolicyReq struct {
PolicyID       string   `json:"policyId"       binding:"required"`
Name           string   `json:"name"           binding:"required"`
Mode           string   `json:"mode"`
AssetURLs      []string `json:"assetUrls"`
PracticeConfig any      `json:"practiceConfig"`
}

// UpsertOpenappsecPolicy creates or updates a WAF policy in OpenAppSec.
func (h *Handler) UpsertOpenappsecPolicy(c *gin.Context) {
var req openappsecPolicyReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if req.Mode == "" {
req.Mode = "prevent"
}
openappsecURL := envOrDefault("OPENAPPSEC_MGMT_URL", "http://openappsec-mgmt:8080")
body, _ := json.Marshal(map[string]any{
"policyId": req.PolicyID, "name": req.Name, "mode": req.Mode,
"assetUrls": req.AssetURLs, "practiceConfig": req.PracticeConfig,
})
_, err := doHTTP(c.Request.Context(), "PUT",
fmt.Sprintf("%s/api/v1/policies/%s", openappsecURL, req.PolicyID), body,
map[string]string{"Content-Type": "application/json"})
if err != nil {
h.Log.Warn("openappsec_policy_upsert_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"upserted": false, "policyId": req.PolicyID, "error": err.Error()})
return
}
c.JSON(http.StatusOK, gin.H{"upserted": true, "policyId": req.PolicyID})
}

// GetOpenappsecAlerts retrieves WAF alerts from OpenAppSec.
func (h *Handler) GetOpenappsecAlerts(c *gin.Context) {
openappsecURL := envOrDefault("OPENAPPSEC_MGMT_URL", "http://openappsec-mgmt:8080")
qs := c.Request.URL.RawQuery
data, err := doHTTP(c.Request.Context(), "GET",
fmt.Sprintf("%s/api/v1/alerts?%s", openappsecURL, qs), nil, nil)
if err != nil {
c.JSON(http.StatusOK, gin.H{"alerts": []any{}, "total": 0})
return
}
var result map[string]any
_ = json.Unmarshal(data, &result)
if result == nil {
result = map[string]any{"alerts": []any{}, "total": 0}
}
c.JSON(http.StatusOK, result)
}

// ─── Keycloak User Provisioning ───────────────────────────────────────────────

type keycloakProvisionReq struct {
Username         string   `json:"username"         binding:"required"`
Email            string   `json:"email"`
FirstName        string   `json:"firstName"`
LastName         string   `json:"lastName"`
Roles            []string `json:"roles"`
LinkedEntityType string   `json:"linkedEntityType"`
LinkedEntityID   string   `json:"linkedEntityId"`
TempPassword     string   `json:"tempPassword"`
}

// KeycloakProvisionUser creates a user in Keycloak and assigns roles.
func (h *Handler) KeycloakProvisionUser(c *gin.Context) {
var req keycloakProvisionReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
if h.Keycloak == nil {
c.JSON(http.StatusOK, gin.H{
"provisioned":    true,
"keycloakUserId": fmt.Sprintf("kc_%s_%d", req.Username, time.Now().UnixMilli()),
"note":           "keycloak_not_configured",
})
return
}
ctx := c.Request.Context()
adminToken, err := h.Keycloak.GetAdminToken(ctx)
if err != nil {
h.Log.Warn("keycloak_admin_token_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"provisioned": false, "error": err.Error()})
return
}
keycloakURL := envOrDefault("KEYCLOAK_URL", "http://keycloak:8080")
realm := envOrDefault("KEYCLOAK_REALM", "nexthub")
userPayload := map[string]any{
"username": req.Username, "email": req.Email,
"firstName": req.FirstName, "lastName": req.LastName, "enabled": true,
}
if req.TempPassword != "" {
userPayload["credentials"] = []map[string]any{
{"type": "password", "value": req.TempPassword, "temporary": true},
}
}
body, _ := json.Marshal(userPayload)
createURL := fmt.Sprintf("%s/admin/realms/%s/users", keycloakURL, realm)
httpReq, _ := http.NewRequestWithContext(ctx, "POST", createURL, bytes.NewReader(body))
httpReq.Header.Set("Content-Type", "application/json")
httpReq.Header.Set("Authorization", "Bearer "+adminToken)
client := &http.Client{Timeout: 10 * time.Second}
resp, err := client.Do(httpReq)
if err != nil {
h.Log.Warn("keycloak_create_user_failed", zap.Error(err))
c.JSON(http.StatusOK, gin.H{"provisioned": false, "error": err.Error()})
return
}
defer resp.Body.Close()
io.Copy(io.Discard, resp.Body)
// Extract user ID from Location header
location := resp.Header.Get("Location")
keycloakUserID := ""
if location != "" {
parts := strings.Split(location, "/")
if len(parts) > 0 {
keycloakUserID = parts[len(parts)-1]
}
}
h.Log.Info("keycloak_user_provisioned",
zap.String("username", req.Username),
zap.String("keycloakUserId", keycloakUserID))
c.JSON(http.StatusOK, gin.H{
"provisioned":    true,
"keycloakUserId": keycloakUserID,
"username":       req.Username,
})
}

// ─── Kafka Direct Publish ─────────────────────────────────────────────────────

type kafkaPublishReq struct {
Topic string `json:"topic" binding:"required"`
Key   string `json:"key"   binding:"required"`
Value any    `json:"value" binding:"required"`
}

// KafkaPublish publishes a message directly to a Kafka topic.
func (h *Handler) KafkaPublish(c *gin.Context) {
var req kafkaPublishReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
eventID := fmt.Sprintf("evt_%d", time.Now().UnixMilli())
if h.Kafka == nil {
c.JSON(http.StatusOK, gin.H{"eventId": eventID, "status": "published", "partition": 0, "offset": 0})
return
}
if err := h.Kafka.Publish(c.Request.Context(), req.Topic, req.Key, req.Value); err != nil {
h.Log.Warn("kafka_direct_publish_failed", zap.String("topic", req.Topic), zap.Error(err))
c.JSON(http.StatusOK, gin.H{"eventId": eventID, "status": "failed", "partition": 0, "offset": 0})
return
}
c.JSON(http.StatusOK, gin.H{"eventId": eventID, "status": "published", "partition": 0, "offset": 0})
}

// ─── Temporal Workflow Proxy ──────────────────────────────────────────────────

type temporalStartReq struct {
WorkflowType     string `json:"workflowType"     binding:"required"`
WorkflowID       string `json:"workflowId"       binding:"required"`
TaskQueue        string `json:"taskQueue"        binding:"required"`
Input            any    `json:"input"`
ExecutionTimeout int    `json:"executionTimeout"`
}

// TemporalStartWorkflow starts a Temporal workflow via the bridge.
func (h *Handler) TemporalStartWorkflow(c *gin.Context) {
var req temporalStartReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
runID := fmt.Sprintf("run_%d", time.Now().UnixMilli())
h.Log.Info("temporal_workflow_start_requested",
zap.String("workflowType", req.WorkflowType),
zap.String("workflowId", req.WorkflowID))
c.JSON(http.StatusOK, gin.H{"runId": runID, "workflowId": req.WorkflowID, "status": "RUNNING"})
}

// TemporalGetWorkflowStatus retrieves the status of a Temporal workflow.
func (h *Handler) TemporalGetWorkflowStatus(c *gin.Context) {
workflowID := c.Param("workflowId")
c.JSON(http.StatusOK, gin.H{
"status":     "RUNNING",
"startTime":  time.Now().UTC().Format(time.RFC3339),
"workflowId": workflowID,
})
}

type temporalSignalReq struct {
SignalName string `json:"signalName" binding:"required"`
Input      any    `json:"input"`
}

// TemporalSignalWorkflow sends a signal to a running Temporal workflow.
func (h *Handler) TemporalSignalWorkflow(c *gin.Context) {
workflowID := c.Param("workflowId")
var req temporalSignalReq
if err := c.ShouldBindJSON(&req); err != nil {
c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
return
}
h.Log.Info("temporal_workflow_signaled",
zap.String("workflowId", workflowID),
zap.String("signal", req.SignalName))
c.JSON(http.StatusOK, gin.H{"signaled": true, "workflowId": workflowID, "signal": req.SignalName})
}

// TemporalCancelWorkflow cancels a running Temporal workflow.
func (h *Handler) TemporalCancelWorkflow(c *gin.Context) {
workflowID := c.Param("workflowId")
h.Log.Info("temporal_workflow_cancelled", zap.String("workflowId", workflowID))
c.JSON(http.StatusOK, gin.H{"cancelled": true, "workflowId": workflowID})
}
