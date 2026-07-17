#!/usr/bin/env bash
# init-keycloak.sh
# Bootstraps the NextHub Keycloak realm after the server starts.
# Idempotent — safe to run multiple times.
#
# Usage: ./init-keycloak.sh
# Env vars (all have defaults for local dev):
#   KEYCLOAK_URL            — e.g. http://localhost:8180
#   KEYCLOAK_ADMIN          — admin username (default: admin)
#   KEYCLOAK_ADMIN_PASSWORD — admin password (default: admin)
#   KEYCLOAK_REALM          — realm name (default: nexthub)
#   BRIDGE_CLIENT_SECRET    — secret for nexthub-bridge client
#   FACE_CLIENT_SECRET      — secret for nexthub-face-biometric client
#   CADDY_CLIENT_SECRET     — secret for nexthub-caddy client
#   PORTAL_CLIENT_SECRET    — secret for nexthub-portal client

set -euo pipefail

KC_URL="${KEYCLOAK_URL:-http://localhost:8180}"
KC_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KC_ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
REALM="${KEYCLOAK_REALM:-nexthub}"

BRIDGE_SECRET="${BRIDGE_CLIENT_SECRET:-nexthub-bridge-secret}"
FACE_SECRET="${FACE_CLIENT_SECRET:-nexthub-face-secret}"
CADDY_SECRET="${CADDY_CLIENT_SECRET:-nexthub-caddy-secret}"
PORTAL_SECRET="${PORTAL_CLIENT_SECRET:-nexthub-portal-secret}"

log() { echo "[init-keycloak] $*"; }

# ─── Wait for Keycloak to be ready ───────────────────────────────────────────
log "Waiting for Keycloak at $KC_URL ..."
for i in $(seq 1 60); do
  if curl -sf "$KC_URL/health/ready" > /dev/null 2>&1; then
    log "Keycloak is ready."
    break
  fi
  if [ "$i" -eq 60 ]; then
    log "ERROR: Keycloak did not become ready in 60 seconds."
    exit 1
  fi
  sleep 2
done

# ─── Obtain admin token ───────────────────────────────────────────────────────
log "Obtaining admin token..."
ADMIN_TOKEN=$(curl -sf -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=admin-cli" \
  -d "username=$KC_ADMIN" \
  -d "password=$KC_ADMIN_PASS" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

AUTH_HEADER="Authorization: Bearer $ADMIN_TOKEN"

# ─── Helper functions ─────────────────────────────────────────────────────────
kc_get() {
  curl -sf -H "$AUTH_HEADER" "$KC_URL/admin/realms/$1" 2>/dev/null
}

kc_post() {
  curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$KC_URL/admin/realms/$1" -d "$2" 2>/dev/null
}

kc_put() {
  curl -sf -X PUT -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$KC_URL/admin/realms/$1" -d "$2" 2>/dev/null
}

realm_exists() {
  curl -sf -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" \
    "$KC_URL/admin/realms/$REALM" | grep -q "200"
}

# ─── Create realm if it doesn't exist ────────────────────────────────────────
if realm_exists; then
  log "Realm '$REALM' already exists — skipping creation."
else
  log "Creating realm '$REALM'..."
  REALM_JSON=$(cat "$(dirname "$0")/realms/nexthub-realm.json")
  curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$KC_URL/admin/realms" -d "$REALM_JSON" > /dev/null
  log "Realm '$REALM' created."
fi

# ─── Set client secrets ───────────────────────────────────────────────────────
set_client_secret() {
  local CLIENT_ID="$1"
  local SECRET="$2"

  # Get internal UUID for the client
  CLIENT_UUID=$(curl -sf -H "$AUTH_HEADER" \
    "$KC_URL/admin/realms/$REALM/clients?clientId=$CLIENT_ID" \
    | python3 -c "import sys,json; clients=json.load(sys.stdin); print(clients[0]['id'] if clients else '')" 2>/dev/null)

  if [ -z "$CLIENT_UUID" ]; then
    log "WARNING: Client '$CLIENT_ID' not found in realm '$REALM'"
    return
  fi

  log "Setting secret for client '$CLIENT_ID' (uuid=$CLIENT_UUID)..."
  curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$KC_URL/admin/realms/$REALM/clients/$CLIENT_UUID/client-secret" \
    -d "{\"type\":\"secret\",\"value\":\"$SECRET\"}" > /dev/null
  log "Secret set for '$CLIENT_ID'."
}

set_client_secret "nexthub-bridge"         "$BRIDGE_SECRET"
set_client_secret "nexthub-face-biometric" "$FACE_SECRET"
set_client_secret "nexthub-caddy"          "$CADDY_SECRET"
set_client_secret "nexthub-portal"         "$PORTAL_SECRET"

# ─── Assign manage-realm role to bridge service account ──────────────────────
log "Assigning manage-realm role to nexthub-bridge service account..."
BRIDGE_UUID=$(curl -sf -H "$AUTH_HEADER" \
  "$KC_URL/admin/realms/$REALM/clients?clientId=nexthub-bridge" \
  | python3 -c "import sys,json; c=json.load(sys.stdin); print(c[0]['id'] if c else '')" 2>/dev/null)

if [ -n "$BRIDGE_UUID" ]; then
  SA_ID=$(curl -sf -H "$AUTH_HEADER" \
    "$KC_URL/admin/realms/$REALM/clients/$BRIDGE_UUID/service-account-user" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

  if [ -n "$SA_ID" ]; then
    # Get realm-management client UUID
    RM_UUID=$(curl -sf -H "$AUTH_HEADER" \
      "$KC_URL/admin/realms/$REALM/clients?clientId=realm-management" \
      | python3 -c "import sys,json; c=json.load(sys.stdin); print(c[0]['id'] if c else '')" 2>/dev/null)

    if [ -n "$RM_UUID" ]; then
      # Get manage-realm role ID
      MANAGE_REALM_ROLE=$(curl -sf -H "$AUTH_HEADER" \
        "$KC_URL/admin/realms/$REALM/clients/$RM_UUID/roles/manage-realm" 2>/dev/null)

      if [ -n "$MANAGE_REALM_ROLE" ] && [ "$MANAGE_REALM_ROLE" != "null" ]; then
        curl -sf -X POST -H "$AUTH_HEADER" -H "Content-Type: application/json" \
          "$KC_URL/admin/realms/$REALM/users/$SA_ID/role-mappings/clients/$RM_UUID" \
          -d "[$MANAGE_REALM_ROLE]" > /dev/null
        log "manage-realm role assigned to nexthub-bridge service account."
      fi
    fi
  fi
fi

# ─── Configure SMTP (optional — only if env vars provided) ───────────────────
if [ -n "${SMTP_HOST:-}" ]; then
  log "Configuring SMTP..."
  curl -sf -X PUT -H "$AUTH_HEADER" -H "Content-Type: application/json" \
    "$KC_URL/admin/realms/$REALM" \
    -d "{
      \"smtpServer\": {
        \"host\": \"${SMTP_HOST}\",
        \"port\": \"${SMTP_PORT:-587}\",
        \"from\": \"${SMTP_FROM:-noreply@nexthub.io}\",
        \"fromDisplayName\": \"NextHub\",
        \"ssl\": \"${SMTP_SSL:-false}\",
        \"starttls\": \"${SMTP_STARTTLS:-true}\",
        \"auth\": \"${SMTP_AUTH:-true}\",
        \"user\": \"${SMTP_USER:-}\",
        \"password\": \"${SMTP_PASSWORD:-}\"
      }
    }" > /dev/null
  log "SMTP configured."
fi

# ─── Print JWKS endpoint for downstream services ─────────────────────────────
log "Keycloak initialisation complete."
log "JWKS endpoint: $KC_URL/realms/$REALM/protocol/openid-connect/certs"
log "Token endpoint: $KC_URL/realms/$REALM/protocol/openid-connect/token"
log "Introspect endpoint: $KC_URL/realms/$REALM/protocol/openid-connect/token/introspect"
log "Userinfo endpoint: $KC_URL/realms/$REALM/protocol/openid-connect/userinfo"
