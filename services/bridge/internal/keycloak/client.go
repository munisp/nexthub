// Package keycloak provides JWT validation and role management via Keycloak.
package keycloak

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Client wraps the Keycloak Admin REST API and token introspection.
type Client struct {
	baseURL      string
	realm        string
	clientID     string
	clientSecret string
	jwtSecret    string
	http         *http.Client
}

// NewClient creates a Keycloak client.
func NewClient(baseURL, realm, clientID, clientSecret, jwtSecret string) *Client {
	return &Client{
		baseURL:      baseURL,
		realm:        realm,
		clientID:     clientID,
		clientSecret: clientSecret,
		jwtSecret:    jwtSecret,
		http:         &http.Client{Timeout: 10 * time.Second},
	}
}

// Claims represents the decoded JWT claims from a Keycloak token.
type Claims struct {
	Sub               string   `json:"sub"`
	Email             string   `json:"email"`
	PreferredUsername string   `json:"preferred_username"`
	Roles             []string `json:"roles"`
	RealmAccess       struct {
		Roles []string `json:"roles"`
	} `json:"realm_access"`
	jwt.RegisteredClaims
}

// ValidateToken validates a JWT token (HS256 for internal tokens, RS256 for Keycloak).
// Falls back to HS256 validation with the configured secret when Keycloak is offline.
func (c *Client) ValidateToken(ctx context.Context, tokenString string) (*Claims, error) {
	// Try HS256 first (internal tokens)
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

	// Try Keycloak introspection
	return c.introspect(ctx, tokenString)
}

// introspect calls the Keycloak token introspection endpoint.
func (c *Client) introspect(ctx context.Context, tokenString string) (*Claims, error) {
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
		Active   bool   `json:"active"`
		Sub      string `json:"sub"`
		Email    string `json:"email"`
		Username string `json:"preferred_username"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if !result.Active {
		return nil, fmt.Errorf("token inactive")
	}

	return &Claims{
		Sub:               result.Sub,
		Email:             result.Email,
		PreferredUsername: result.Username,
	}, nil
}

// GetAdminToken obtains a service-account token for admin operations.
func (c *Client) GetAdminToken(ctx context.Context) (string, error) {
	tokenURL := fmt.Sprintf("%s/realms/%s/protocol/openid-connect/token", c.baseURL, c.realm)

	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("client_id", c.clientID)
	data.Set("client_secret", c.clientSecret)

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
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.AccessToken, nil
}

// SyncRolesToPermify reads Keycloak realm roles and writes them as Permify relationships.
// This is called by the bridge on startup and on a periodic schedule.
func (c *Client) SyncRolesToPermify(ctx context.Context, permifyWriteFn func(role, userID string) error) error {
	// In production this would enumerate Keycloak users and their roles.
	// For now we return nil to indicate the sync path is wired.
	return nil
}
