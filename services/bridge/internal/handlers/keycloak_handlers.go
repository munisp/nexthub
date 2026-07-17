// keycloak_handlers.go — Keycloak Admin API relay handlers for the Go Bridge.
// Covers: user CRUD, role assignment, realm management, token introspection,
// and Permify role sync.
package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/munisp/nexthub/bridge/internal/keycloak"
	"go.uber.org/zap"
)

// ─── User management ──────────────────────────────────────────────────────────

// HandleKeycloakCreateUser creates a user in the configured Keycloak realm.
// POST /v1/keycloak/users
func (h *Handler) HandleKeycloakCreateUser(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	var u keycloak.UserRepresentation
	if err := c.ShouldBindJSON(&u); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	userID, err := h.Keycloak.CreateUser(c.Request.Context(), u)
	if err != nil {
		h.Log.Warn("keycloak_create_user", zap.Error(err))
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_user_created", zap.String("id", userID), zap.String("username", u.Username))
	c.JSON(http.StatusCreated, gin.H{"id": userID, "username": u.Username})
}

// HandleKeycloakGetUser fetches a user by Keycloak UUID.
// GET /v1/keycloak/users/:id
func (h *Handler) HandleKeycloakGetUser(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	u, err := h.Keycloak.GetUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, u)
}

// HandleKeycloakUpdateUser updates a user's profile.
// PUT /v1/keycloak/users/:id
func (h *Handler) HandleKeycloakUpdateUser(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	var u keycloak.UserRepresentation
	if err := c.ShouldBindJSON(&u); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Keycloak.UpdateUser(c.Request.Context(), userID, u); err != nil {
		h.Log.Warn("keycloak_update_user", zap.String("id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"updated": true, "id": userID})
}

// HandleKeycloakDeleteUser deletes a user from the realm.
// DELETE /v1/keycloak/users/:id
func (h *Handler) HandleKeycloakDeleteUser(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	if err := h.Keycloak.DeleteUser(c.Request.Context(), userID); err != nil {
		h.Log.Warn("keycloak_delete_user", zap.String("id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_user_deleted", zap.String("id", userID))
	c.JSON(http.StatusOK, gin.H{"deleted": true, "id": userID})
}

// HandleKeycloakListUsers lists users in the realm with optional search.
// GET /v1/keycloak/users?search=&first=0&max=50
func (h *Handler) HandleKeycloakListUsers(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	search := c.Query("search")
	first, _ := strconv.Atoi(c.DefaultQuery("first", "0"))
	max, _ := strconv.Atoi(c.DefaultQuery("max", "50"))
	users, err := h.Keycloak.ListUsers(c.Request.Context(), search, first, max)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"users": users, "count": len(users)})
}

// HandleKeycloakSetPassword resets a user's password.
// PUT /v1/keycloak/users/:id/password
func (h *Handler) HandleKeycloakSetPassword(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	var req struct {
		Password  string `json:"password"  binding:"required"`
		Temporary bool   `json:"temporary"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Keycloak.SetPassword(c.Request.Context(), userID, req.Password, req.Temporary); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"passwordReset": true, "id": userID})
}

// HandleKeycloakSendVerificationEmail sends a verification email to the user.
// POST /v1/keycloak/users/:id/send-verify-email
func (h *Handler) HandleKeycloakSendVerificationEmail(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	if err := h.Keycloak.SendVerificationEmail(c.Request.Context(), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"sent": true, "id": userID})
}

// ─── Role management ──────────────────────────────────────────────────────────

// HandleKeycloakListRoles lists all realm roles.
// GET /v1/keycloak/roles
func (h *Handler) HandleKeycloakListRoles(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	roles, err := h.Keycloak.ListRoles(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"roles": roles})
}

// HandleKeycloakGetRole fetches a realm role by name.
// GET /v1/keycloak/roles/:name
func (h *Handler) HandleKeycloakGetRole(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	roleName := c.Param("name")
	role, err := h.Keycloak.GetRole(c.Request.Context(), roleName)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, role)
}

// HandleKeycloakAssignRoles assigns realm roles to a user.
// POST /v1/keycloak/users/:id/roles
func (h *Handler) HandleKeycloakAssignRoles(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	var roles []keycloak.RoleRepresentation
	if err := c.ShouldBindJSON(&roles); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Keycloak.AssignRealmRoles(c.Request.Context(), userID, roles); err != nil {
		h.Log.Warn("keycloak_assign_roles", zap.String("user", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_roles_assigned", zap.String("user", userID), zap.Int("count", len(roles)))
	c.JSON(http.StatusOK, gin.H{"assigned": true, "userId": userID, "count": len(roles)})
}

// HandleKeycloakRemoveRoles removes realm roles from a user.
// DELETE /v1/keycloak/users/:id/roles
func (h *Handler) HandleKeycloakRemoveRoles(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	var roles []keycloak.RoleRepresentation
	if err := c.ShouldBindJSON(&roles); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Keycloak.RemoveRealmRoles(c.Request.Context(), userID, roles); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"removed": true, "userId": userID})
}

// HandleKeycloakGetUserRoles returns the realm roles assigned to a user.
// GET /v1/keycloak/users/:id/roles
func (h *Handler) HandleKeycloakGetUserRoles(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	userID := c.Param("id")
	roles, err := h.Keycloak.GetUserRoles(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"roles": roles, "userId": userID})
}

// ─── Realm management ─────────────────────────────────────────────────────────

// HandleKeycloakCreateRealm creates a new Keycloak realm (for tenant provisioning).
// POST /v1/keycloak/realms
func (h *Handler) HandleKeycloakCreateRealm(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	var r keycloak.RealmRepresentation
	if err := c.ShouldBindJSON(&r); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.Keycloak.CreateRealm(c.Request.Context(), r); err != nil {
		h.Log.Warn("keycloak_create_realm", zap.String("realm", r.Realm), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_realm_created", zap.String("realm", r.Realm))
	c.JSON(http.StatusCreated, gin.H{"created": true, "realm": r.Realm})
}

// HandleKeycloakGetRealm fetches a realm's representation.
// GET /v1/keycloak/realms/:realm
func (h *Handler) HandleKeycloakGetRealm(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	realmID := c.Param("realm")
	realm, err := h.Keycloak.GetRealm(c.Request.Context(), realmID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, realm)
}

// HandleKeycloakDeleteRealm deletes a Keycloak realm.
// DELETE /v1/keycloak/realms/:realm
func (h *Handler) HandleKeycloakDeleteRealm(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	realmID := c.Param("realm")
	if err := h.Keycloak.DeleteRealm(c.Request.Context(), realmID); err != nil {
		h.Log.Warn("keycloak_delete_realm", zap.String("realm", realmID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_realm_deleted", zap.String("realm", realmID))
	c.JSON(http.StatusOK, gin.H{"deleted": true, "realm": realmID})
}

// ─── Token introspection ──────────────────────────────────────────────────────

// HandleKeycloakIntrospect introspects a Bearer token and returns the claims.
// POST /v1/keycloak/introspect
func (h *Handler) HandleKeycloakIntrospect(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	claims, err := h.Keycloak.Introspect(c.Request.Context(), req.Token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"active": false, "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"active":   true,
		"sub":      claims.Sub,
		"email":    claims.Email,
		"username": claims.PreferredUsername,
		"roles":    claims.RealmAccess.Roles,
		"tenantId": claims.TenantID,
	})
}

// ─── Permify sync ─────────────────────────────────────────────────────────────

// HandleKeycloakSyncPermify triggers a full Keycloak → Permify role sync.
// POST /v1/keycloak/sync-permify
func (h *Handler) HandleKeycloakSyncPermify(c *gin.Context) {
	if h.Keycloak == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "keycloak not configured"})
		return
	}
	count := 0
	err := h.Keycloak.SyncRolesToPermify(c.Request.Context(), func(role, userID string) error {
		count++
		h.Log.Debug("permify_sync", zap.String("role", role), zap.String("user", userID))
		return nil
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	h.Log.Info("keycloak_permify_sync_complete", zap.Int("relationships", count))
	c.JSON(http.StatusOK, gin.H{"synced": true, "relationships": count})
}
