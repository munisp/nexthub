#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# NextHub Caddy Edge Proxy — Entrypoint
#
# Starts the OpenAppSec nano-agent as a background process, waits for its
# Unix socket to become available, then starts Caddy in the foreground.
# ─────────────────────────────────────────────────────────────────────────────

set -e

APPSEC_SOCKET="${OPENAPPSEC_SOCKET:-/run/appsec.sock}"
APPSEC_AGENT="/usr/sbin/cp-nano-agent"
APPSEC_POLICY="/etc/openappsec/policy.json"
APPSEC_LOG_LEVEL="${APPSEC_LOG_LEVEL:-info}"

# ── Start OpenAppSec nano-agent ───────────────────────────────────────────────
if [ -x "$APPSEC_AGENT" ]; then
    echo "[entrypoint] Starting OpenAppSec nano-agent..."
    "$APPSEC_AGENT" \
        --policy "$APPSEC_POLICY" \
        --socket "$APPSEC_SOCKET" \
        --log-level "$APPSEC_LOG_LEVEL" \
        &
    APPSEC_PID=$!

    # Wait up to 15 seconds for the socket to appear
    WAIT=0
    until [ -S "$APPSEC_SOCKET" ] || [ $WAIT -ge 15 ]; do
        sleep 1
        WAIT=$((WAIT + 1))
    done

    if [ -S "$APPSEC_SOCKET" ]; then
        echo "[entrypoint] OpenAppSec nano-agent ready (socket: $APPSEC_SOCKET)"
    else
        echo "[entrypoint] WARNING: OpenAppSec socket not found after ${WAIT}s — starting Caddy in passthrough mode"
    fi
else
    echo "[entrypoint] OpenAppSec agent not found — starting Caddy without WAF (dev mode)"
fi

# ── Start Caddy ───────────────────────────────────────────────────────────────
echo "[entrypoint] Starting Caddy..."
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
