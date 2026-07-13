package middleware

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
)

// PartnerKeyRecord holds the validated partner API key record.
type PartnerKeyRecord struct {
	KeyID      string
	PartnerID  string
	PartnerName string
	Scopes     []string
	RateLimit  int // requests per minute; 0 = unlimited
	IsActive   bool
}

// PartnerAuth validates an X-API-Key header against the database.
// It caches key lookups in Redis for 5 minutes to avoid DB round-trips on
// every camera frame or high-frequency identification request.
//
// The key is stored as a SHA-256 hash in the DB (never in plaintext).
// Format: nhfb_<random-32-hex>   (nexthub face biometric)
func PartnerAuth(db *sql.DB, rdb *redis.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := c.GetHeader("X-API-Key")
		if raw == "" {
			raw = c.GetHeader("Authorization")
			if strings.HasPrefix(raw, "Bearer ") {
				raw = strings.TrimPrefix(raw, "Bearer ")
			} else {
				raw = ""
			}
		}
		if raw == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "missing X-API-Key or Authorization: Bearer <key> header",
				"code":  "PARTNER_KEY_MISSING",
			})
			return
		}

		// Hash the raw key to look it up
		hash := hashKey(raw)
		cacheKey := "partner_key:" + hash

		// 1. Try Redis cache first
		var rec PartnerKeyRecord
		cached, err := rdb.Get(context.Background(), cacheKey).Result()
		if err == nil {
			if jsonErr := json.Unmarshal([]byte(cached), &rec); jsonErr == nil {
				if !rec.IsActive {
					c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
						"error": "partner API key is revoked",
						"code":  "PARTNER_KEY_REVOKED",
					})
					return
				}
				applyRateLimit(c, rdb, rec)
				c.Set("partner", rec)
				c.Next()
				return
			}
		}

		// 2. Fall back to DB lookup
		row := db.QueryRowContext(context.Background(), `
			SELECT
				pk.id,
				pk.partner_id,
				p.name,
				pk.scopes,
				pk.rate_limit_rpm,
				pk.is_active
			FROM face_partner_api_keys pk
			JOIN face_partners p ON p.id = pk.partner_id
			WHERE pk.key_hash = $1
		`, hash)

		var scopesJSON string
		if scanErr := row.Scan(
			&rec.KeyID, &rec.PartnerID, &rec.PartnerName,
			&scopesJSON, &rec.RateLimit, &rec.IsActive,
		); scanErr != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "invalid API key",
				"code":  "PARTNER_KEY_INVALID",
			})
			return
		}

		_ = json.Unmarshal([]byte(scopesJSON), &rec.Scopes)

		if !rec.IsActive {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"error": "partner API key is revoked",
				"code":  "PARTNER_KEY_REVOKED",
			})
			return
		}

		// Cache for 5 minutes
		if b, marshalErr := json.Marshal(rec); marshalErr == nil {
			rdb.Set(context.Background(), cacheKey, string(b), 5*time.Minute)
		}

		// Update last_used_at asynchronously
		go func() {
			_, _ = db.ExecContext(context.Background(),
				`UPDATE face_partner_api_keys SET last_used_at = NOW() WHERE id = $1`,
				rec.KeyID,
			)
		}()

		applyRateLimit(c, rdb, rec)
		c.Set("partner", rec)
		c.Next()
	}
}

// RequireScope checks that the authenticated partner has the required scope.
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		rec, ok := c.Get("partner")
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "not authenticated",
				"code":  "NOT_AUTHENTICATED",
			})
			return
		}
		partner := rec.(PartnerKeyRecord)
		for _, s := range partner.Scopes {
			if s == scope || s == "face:*" || s == "*" {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"error": fmt.Sprintf("partner key does not have scope '%s'", scope),
			"code":  "PARTNER_SCOPE_DENIED",
		})
	}
}

// applyRateLimit enforces a per-key sliding-window rate limit using Redis.
func applyRateLimit(c *gin.Context, rdb *redis.Client, rec PartnerKeyRecord) {
	if rec.RateLimit <= 0 {
		return // unlimited
	}
	window := time.Now().Unix() / 60 // 1-minute window
	rlKey := fmt.Sprintf("rl:partner:%s:%d", rec.KeyID, window)
	ctx := context.Background()

	pipe := rdb.Pipeline()
	incr := pipe.Incr(ctx, rlKey)
	pipe.Expire(ctx, rlKey, 2*time.Minute)
	_, _ = pipe.Exec(ctx)

	count := incr.Val()
	remaining := int64(rec.RateLimit) - count
	if remaining < 0 {
		remaining = 0
	}

	c.Header("X-RateLimit-Limit", fmt.Sprintf("%d", rec.RateLimit))
	c.Header("X-RateLimit-Remaining", fmt.Sprintf("%d", remaining))
	c.Header("X-RateLimit-Reset", fmt.Sprintf("%d", (window+1)*60))

	if count > int64(rec.RateLimit) {
		c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
			"error": "rate limit exceeded",
			"code":  "RATE_LIMIT_EXCEEDED",
			"retry_after_seconds": (window+1)*60 - time.Now().Unix(),
		})
	}
}

// hashKey returns the SHA-256 hex digest of the raw API key.
func hashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", h)
}
