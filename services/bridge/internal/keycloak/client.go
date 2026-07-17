// Package keycloak provides JWT validation, token introspection, and Admin API
// operations for the NextHub Go Bridge service.
package keycloak

import (
"bytes"
"context"
"encoding/json"
"fmt"
"io"
"net/http"
"net/url"
"strings"
"sync"
"time"

"github.com/golang-jwt/jwt/v5"
)

// ─── Client ──────────────────────────────────────────────────────────────────

// Client wraps the Keycloak Admin REST API and token introspection.
type Client struct {
baseURL      string
realm        string
clientID     string
clientSecret string
jwtSecret    string
adminUser    string
adminPass    string
http         *http.Client

// cached admin token (master realm)
mu          sync.Mutex
adminToken  string
adminExpiry time.Time
}

// NewClient creates a Keycloak client.
func NewClient(baseURL, realm, clientID, clientSecret, jwtSecret string) *Client {
return &Client{
baseURL:      baseURL,
realm:        realm,
clientID:     clientID,
clientSecret: clientSecret,
jwtSecret:    jwtSecret,
http:         &http.Client{Timeout: 15 * time.Second},
}
}

// WithAdminCredentials sets the Keycloak master-realm admin credentials.
func (c *Client) WithAdminCredentials(adminUser, adminPass string) *Client {
c.adminUser = adminUser
c.adminPass = adminPass
return c
}

// ─── Claims ───────────────────────────────────────────────────────────────────

// Claims represents the decoded JWT claims from a Keycloak token.
type Claims struct {
Sub               string `json:"sub"`
Email             string `json:"email"`
PreferredUsername string `json:"preferred_username"`
Name              string `json:"name"`
TenantID          string `json:"tenant_id"`
TenantSlug        string `json:"tenant_slug"`
Roles             []string `json:"roles"`
RealmAccess       struct {
Roles []string `json:"roles"`
} `json:"realm_access"`
ResourceAccess map[string]struct {
Roles []string `json:"roles"`
} `json:"resource_access"`
jwt.RegisteredClaims
}

// AllRoles returns the union of realm_access.roles and resource_access[clientID].roles.
func (cl *Claims) AllRoles(clientID string) []string {
seen := make(map[string]bool)
var out []string
for _, r := range cl.RealmAccess.Roles {
if !seen[r] {
seen[r] = true
out = append(out, r)
}
}
if ra, ok := cl.ResourceAccess[clientID]; ok {
for _, r := range ra.Roles {
if !seen[r] {
seen[r] = true
out = append(out, r)
}
}
}
return out
}

// HasRole returns true if the claims include the given role.
func (cl *Claims) HasRole(role, clientID string) bool {
for _, r := range cl.AllRoles(clientID) {
if r == role {
return true
}
}
return false
}

// ─── Token validation ─────────────────────────────────────────────────────────

// ValidateToken validates a JWT token.
// Priority: HS256 internal token → Keycloak RS256 introspection.
func (c *Client) ValidateToken(ctx context.Context, tokenString string) (*Claims, error) {
claims := &Claims{}
token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
}
return []byte(c.jwtSecret), nil
})
if err == nil && token.Valid {
return claims, nil
}
return c.Introspect(ctx, tokenString)
}

// Introspect calls the Keycloak token introspection endpoint.
func (c *Client) Introspect(ctx context.Context, tokenString string) (*Claims, error) {
introspectURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token/introspect",
c.baseURL, c.realm)
data := url.Values{}
data.Set("token", tokenString)
data.Set("client_id", c.clientID)
data.Set("client_secret", c.clientSecret)

req, err := http.NewRequestWithContext(ctx, "POST", introspectURL,
strings.NewReader(data.Encode()))
if err != nil {
return nil, err
}
req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

resp, err := c.http.Do(req)
if err != nil {
return nil, fmt.Errorf("keycloak unreachable: %w", err)
}
defer resp.Body.Close()

var result struct {
Active      bool   `json:"active"`
Sub         string `json:"sub"`
Email       string `json:"email"`
Username    string `json:"preferred_username"`
Name        string `json:"name"`
TenantID    string `json:"tenant_id"`
TenantSlug  string `json:"tenant_slug"`
RealmAccess struct {
Roles []string `json:"roles"`
} `json:"realm_access"`
}
if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
return nil, err
}
if !result.Active {
return nil, fmt.Errorf("token inactive or expired")
}
cl := &Claims{
Sub:               result.Sub,
Email:             result.Email,
PreferredUsername: result.Username,
Name:              result.Name,
TenantID:          result.TenantID,
TenantSlug:        result.TenantSlug,
}
cl.RealmAccess.Roles = result.RealmAccess.Roles
return cl, nil
}

// ─── Admin token (master realm) ───────────────────────────────────────────────

// GetAdminToken obtains a master-realm admin token using password grant.
// Result is cached for 55 seconds.
func (c *Client) GetAdminToken(ctx context.Context) (string, error) {
c.mu.Lock()
defer c.mu.Unlock()
if c.adminToken != "" && time.Now().Before(c.adminExpiry) {
return c.adminToken, nil
}
tokenURL := fmt.Sprintf("%s/realms/master/protocol/openid-connect/token", c.baseURL)
data := url.Values{}
data.Set("grant_type", "password")
data.Set("client_id", "admin-cli")
data.Set("username", c.adminUser)
data.Set("password", c.adminPass)

req, err := http.NewRequestWithContext(ctx, "POST", tokenURL, strings.NewReader(data.Encode()))
if err != nil {
return "", err
}
req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

resp, err := c.http.Do(req)
if err != nil {
return "", fmt.Errorf("keycloak unreachable: %w", err)
}
defer resp.Body.Close()

var result struct {
AccessToken string `json:"access_token"`
ExpiresIn   int    `json:"expires_in"`
}
if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
return "", err
}
if result.AccessToken == "" {
return "", fmt.Errorf("keycloak admin token: empty response")
}
c.adminToken = result.AccessToken
ttl := result.ExpiresIn - 5
if ttl < 1 {
ttl = 1
}
c.adminExpiry = time.Now().Add(time.Duration(ttl) * time.Second)
return c.adminToken, nil
}

// ─── Admin API helpers ────────────────────────────────────────────────────────

func (c *Client) adminReq(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
token, err := c.GetAdminToken(ctx)
if err != nil {
return nil, fmt.Errorf("admin token: %w", err)
}
fullURL := fmt.Sprintf("%s/admin/realms/%s%s", c.baseURL, c.realm, path)
return c.doAdminReq(ctx, method, fullURL, token, body)
}

func (c *Client) adminReqMaster(ctx context.Context, method, path string, body interface{}) (*http.Response, error) {
token, err := c.GetAdminToken(ctx)
if err != nil {
return nil, fmt.Errorf("admin token: %w", err)
}
fullURL := fmt.Sprintf("%s/admin%s", c.baseURL, path)
return c.doAdminReq(ctx, method, fullURL, token, body)
}

func (c *Client) doAdminReq(ctx context.Context, method, fullURL, token string, body interface{}) (*http.Response, error) {
var bodyReader io.Reader
if body != nil {
b, err := json.Marshal(body)
if err != nil {
return nil, err
}
bodyReader = bytes.NewReader(b)
}
req, err := http.NewRequestWithContext(ctx, method, fullURL, bodyReader)
if err != nil {
return nil, err
}
req.Header.Set("Authorization", "Bearer "+token)
if body != nil {
req.Header.Set("Content-Type", "application/json")
}
return c.http.Do(req)
}

// ─── User management ──────────────────────────────────────────────────────────

// UserRepresentation mirrors the Keycloak user object.
type UserRepresentation struct {
ID            string              `json:"id,omitempty"`
Username      string              `json:"username"`
Email         string              `json:"email"`
FirstName     string              `json:"firstName,omitempty"`
LastName      string              `json:"lastName,omitempty"`
Enabled       bool                `json:"enabled"`
EmailVerified bool                `json:"emailVerified"`
Attributes    map[string][]string `json:"attributes,omitempty"`
Credentials   []struct {
Type      string `json:"type"`
Value     string `json:"value"`
Temporary bool   `json:"temporary"`
} `json:"credentials,omitempty"`
}

// CreateUser creates a user in the realm. Returns the new user's UUID.
func (c *Client) CreateUser(ctx context.Context, u UserRepresentation) (string, error) {
resp, err := c.adminReq(ctx, "POST", "/users", u)
if err != nil {
return "", err
}
defer resp.Body.Close()
if resp.StatusCode == 409 {
return "", fmt.Errorf("user already exists: %s", u.Username)
}
if resp.StatusCode != 201 {
body, _ := io.ReadAll(resp.Body)
return "", fmt.Errorf("create user failed (%d): %s", resp.StatusCode, string(body))
}
loc := resp.Header.Get("Location")
parts := strings.Split(loc, "/")
return parts[len(parts)-1], nil
}

// GetUser fetches a user by Keycloak UUID.
func (c *Client) GetUser(ctx context.Context, userID string) (*UserRepresentation, error) {
resp, err := c.adminReq(ctx, "GET", "/users/"+userID, nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
if resp.StatusCode == 404 {
return nil, fmt.Errorf("user not found: %s", userID)
}
var u UserRepresentation
return &u, json.NewDecoder(resp.Body).Decode(&u)
}

// UpdateUser updates a user's profile.
func (c *Client) UpdateUser(ctx context.Context, userID string, u UserRepresentation) error {
resp, err := c.adminReq(ctx, "PUT", "/users/"+userID, u)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode != 204 {
body, _ := io.ReadAll(resp.Body)
return fmt.Errorf("update user failed (%d): %s", resp.StatusCode, string(body))
}
return nil
}

// DeleteUser deletes a user from the realm.
func (c *Client) DeleteUser(ctx context.Context, userID string) error {
resp, err := c.adminReq(ctx, "DELETE", "/users/"+userID, nil)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode != 204 && resp.StatusCode != 404 {
body, _ := io.ReadAll(resp.Body)
return fmt.Errorf("delete user failed (%d): %s", resp.StatusCode, string(body))
}
return nil
}

// ListUsers lists users in the realm with optional search.
func (c *Client) ListUsers(ctx context.Context, search string, first, max int) ([]UserRepresentation, error) {
path := fmt.Sprintf("/users?first=%d&max=%d", first, max)
if search != "" {
path += "&search=" + url.QueryEscape(search)
}
resp, err := c.adminReq(ctx, "GET", path, nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
var users []UserRepresentation
return users, json.NewDecoder(resp.Body).Decode(&users)
}

// SetPassword resets a user's password.
func (c *Client) SetPassword(ctx context.Context, userID, password string, temporary bool) error {
body := map[string]interface{}{
"type":      "password",
"value":     password,
"temporary": temporary,
}
resp, err := c.adminReq(ctx, "PUT", "/users/"+userID+"/reset-password", body)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode != 204 {
b, _ := io.ReadAll(resp.Body)
return fmt.Errorf("set password failed (%d): %s", resp.StatusCode, string(b))
}
return nil
}

// SendVerificationEmail sends an email verification link to the user.
func (c *Client) SendVerificationEmail(ctx context.Context, userID string) error {
resp, err := c.adminReq(ctx, "PUT", "/users/"+userID+"/send-verify-email", nil)
if err != nil {
return err
}
defer resp.Body.Close()
return nil
}

// ─── Role management ──────────────────────────────────────────────────────────

// RoleRepresentation mirrors the Keycloak role object.
type RoleRepresentation struct {
ID          string `json:"id"`
Name        string `json:"name"`
Description string `json:"description,omitempty"`
Composite   bool   `json:"composite,omitempty"`
}

// GetRole fetches a realm role by name.
func (c *Client) GetRole(ctx context.Context, roleName string) (*RoleRepresentation, error) {
resp, err := c.adminReq(ctx, "GET", "/roles/"+roleName, nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
if resp.StatusCode == 404 {
return nil, fmt.Errorf("role not found: %s", roleName)
}
var role RoleRepresentation
return &role, json.NewDecoder(resp.Body).Decode(&role)
}

// ListRoles lists all realm roles.
func (c *Client) ListRoles(ctx context.Context) ([]RoleRepresentation, error) {
resp, err := c.adminReq(ctx, "GET", "/roles", nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
var roles []RoleRepresentation
return roles, json.NewDecoder(resp.Body).Decode(&roles)
}

// AssignRealmRoles assigns realm roles to a user.
func (c *Client) AssignRealmRoles(ctx context.Context, userID string, roles []RoleRepresentation) error {
resp, err := c.adminReq(ctx, "POST", "/users/"+userID+"/role-mappings/realm", roles)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode != 204 {
b, _ := io.ReadAll(resp.Body)
return fmt.Errorf("assign roles failed (%d): %s", resp.StatusCode, string(b))
}
return nil
}

// RemoveRealmRoles removes realm roles from a user.
func (c *Client) RemoveRealmRoles(ctx context.Context, userID string, roles []RoleRepresentation) error {
resp, err := c.adminReq(ctx, "DELETE", "/users/"+userID+"/role-mappings/realm", roles)
if err != nil {
return err
}
defer resp.Body.Close()
return nil
}

// GetUserRoles returns the realm roles assigned to a user.
func (c *Client) GetUserRoles(ctx context.Context, userID string) ([]RoleRepresentation, error) {
resp, err := c.adminReq(ctx, "GET", "/users/"+userID+"/role-mappings/realm", nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
var roles []RoleRepresentation
return roles, json.NewDecoder(resp.Body).Decode(&roles)
}

// ─── Realm management ─────────────────────────────────────────────────────────

// RealmRepresentation is a minimal Keycloak realm config.
type RealmRepresentation struct {
Realm                     string `json:"realm"`
DisplayName               string `json:"displayName,omitempty"`
Enabled                   bool   `json:"enabled"`
SSLRequired               string `json:"sslRequired,omitempty"`
BruteForceProtected       bool   `json:"bruteForceProtected,omitempty"`
DefaultSignatureAlgorithm string `json:"defaultSignatureAlgorithm,omitempty"`
}

// CreateRealm creates a new Keycloak realm.
func (c *Client) CreateRealm(ctx context.Context, r RealmRepresentation) error {
resp, err := c.adminReqMaster(ctx, "POST", "/realms", r)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode == 409 {
return nil // already exists — idempotent
}
if resp.StatusCode != 201 {
b, _ := io.ReadAll(resp.Body)
return fmt.Errorf("create realm failed (%d): %s", resp.StatusCode, string(b))
}
return nil
}

// DeleteRealm deletes a Keycloak realm.
func (c *Client) DeleteRealm(ctx context.Context, realmID string) error {
resp, err := c.adminReqMaster(ctx, "DELETE", "/realms/"+realmID, nil)
if err != nil {
return err
}
defer resp.Body.Close()
if resp.StatusCode != 204 && resp.StatusCode != 404 {
b, _ := io.ReadAll(resp.Body)
return fmt.Errorf("delete realm failed (%d): %s", resp.StatusCode, string(b))
}
return nil
}

// GetRealm fetches a realm's representation.
func (c *Client) GetRealm(ctx context.Context, realmID string) (*RealmRepresentation, error) {
resp, err := c.adminReqMaster(ctx, "GET", "/realms/"+realmID, nil)
if err != nil {
return nil, err
}
defer resp.Body.Close()
if resp.StatusCode == 404 {
return nil, fmt.Errorf("realm not found: %s", realmID)
}
var realm RealmRepresentation
return &realm, json.NewDecoder(resp.Body).Decode(&realm)
}

// ─── Permify sync ─────────────────────────────────────────────────────────────

// SyncRolesToPermify reads Keycloak realm roles and writes them as Permify relationships.
func (c *Client) SyncRolesToPermify(ctx context.Context, permifyWriteFn func(role, userID string) error) error {
users, err := c.ListUsers(ctx, "", 0, 1000)
if err != nil {
return fmt.Errorf("list users: %w", err)
}
for _, u := range users {
if u.ID == "" {
continue
}
roles, err := c.GetUserRoles(ctx, u.ID)
if err != nil {
continue
}
for _, r := range roles {
if err := permifyWriteFn(r.Name, u.ID); err != nil {
return fmt.Errorf("permify write: %w", err)
}
}
}
return nil
}
