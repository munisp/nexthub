// Package middleware provides Gin middleware for the bridge service.
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/munisp/nexthub/bridge/internal/keycloak"
)

// ─── Internal key auth ────────────────────────────────────────────────────────

// InternalKeyAuth validates the X-Internal-Key header on all bridge requests.
func InternalKeyAuth(expectedKey string) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-Internal-Key")
		if key == "" {
			key = c.GetHeader("x-internal-key")
		}
		if key != expectedKey {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing or invalid X-Internal-Key",
			})
			return
		}
		c.Next()
	}
}

// ─── Keycloak Bearer token auth ───────────────────────────────────────────────

// keycloakClaimsKey is the context key for storing validated Keycloak claims.
const keycloakClaimsKey = "keycloak_claims"

// KeycloakAuth validates a Keycloak Bearer token and stores the claims in the
// Gin context under keycloakClaimsKey. Routes that require authentication should
// use this middleware. Routes that require specific roles should additionally use
// RequireRole.
func KeycloakAuth(kc *keycloak.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing Authorization header",
			})
			return
		}
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid Authorization header format — expected 'Bearer <token>'",
			})
			return
		}
		tokenStr := parts[1]
		claims, err := kc.ValidateToken(context.Background(), tokenStr)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid or expired token: " + err.Error(),
			})
			return
		}
		c.Set(keycloakClaimsKey, claims)
		c.Next()
	}
}

// GetClaims retrieves the validated Keycloak claims from the Gin context.
// Returns nil if KeycloakAuth middleware was not applied or token was invalid.
func GetClaims(c *gin.Context) *keycloak.Claims {
	v, exists := c.Get(keycloakClaimsKey)
	if !exists {
		return nil
	}
	claims, _ := v.(*keycloak.Claims)
	return claims
}

// RequireRole returns a middleware that enforces that the authenticated user
// holds at least one of the specified realm roles. Must be used after KeycloakAuth.
func RequireRole(clientID string, roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := GetClaims(c)
		if claims == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "authentication required",
			})
			return
		}
		for _, role := range roles {
			if claims.HasRole(role, clientID) {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": "insufficient role — required one of: " + strings.Join(roles, ", "),
		})
	}
}

// ─── General middleware ───────────────────────────────────────────────────────

// RequestLogger logs every incoming request.
func RequestLogger() gin.HandlerFunc {
	return gin.Logger()
}

// Recovery recovers from panics and returns a 500.
func Recovery() gin.HandlerFunc {
	return gin.Recovery()
}
