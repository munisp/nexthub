// Package middleware provides Gin middleware for the bridge service.
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

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

// RequestLogger logs every incoming request.
func RequestLogger() gin.HandlerFunc {
	return gin.Logger()
}

// Recovery recovers from panics and returns a 500.
func Recovery() gin.HandlerFunc {
	return gin.Recovery()
}
