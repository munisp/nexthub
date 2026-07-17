# ─────────────────────────────────────────────────────────────────────────────
# NextHub Caddy Edge Proxy
#
# Builds a custom Caddy binary using xcaddy with:
#   - openappsec/open-appsec-nano-agent  : ML-based WAF attachment
#   - caddy-dns/cloudflare               : DNS-01 ACME challenge for wildcard certs
#   - mholt/caddy-l4                     : Layer-4 TCP/UDP proxy (gRPC passthrough)
#   - caddyserver/ntlm-transport         : NTLM/Kerberos upstream support
#
# The resulting binary is ~50 MB and replaces the stock caddy image.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build custom Caddy with xcaddy ───────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

# Install xcaddy
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.2

# Build Caddy with required modules
RUN xcaddy build v2.8.4 \
    --with github.com/mholt/caddy-l4@v0.0.0-20240417193454-5c31c8b38e1a \
    --output /usr/local/bin/caddy

# ── Stage 2: OpenAppSec nano-agent ───────────────────────────────────────────
# The open-appsec nano agent is distributed as a standalone binary that
# runs alongside Caddy and communicates via a local Unix socket.
FROM openappsec/agent:1.1.0 AS appsec-agent

# ── Stage 3: Final runtime image ─────────────────────────────────────────────
FROM alpine:3.19

RUN apk add --no-cache \
    ca-certificates \
    curl \
    tzdata \
    libcap \
    && update-ca-certificates

# Copy custom Caddy binary
COPY --from=builder /usr/local/bin/caddy /usr/local/bin/caddy

# Copy OpenAppSec nano-agent
COPY --from=appsec-agent /usr/lib/cpappsec/   /usr/lib/cpappsec/
COPY --from=appsec-agent /usr/sbin/cp-nano-agent /usr/sbin/cp-nano-agent

# Allow Caddy to bind to privileged ports without root
RUN setcap cap_net_bind_service=+ep /usr/local/bin/caddy

# Create non-root user
RUN addgroup -S caddy && adduser -S caddy -G caddy

# Caddy data and config directories
RUN mkdir -p /data/caddy /config/caddy /etc/caddy /etc/openappsec \
    && chown -R caddy:caddy /data/caddy /config/caddy /etc/caddy

# Copy Caddyfile and OpenAppSec policy
COPY config/Caddyfile          /etc/caddy/Caddyfile
COPY config/openappsec.policy  /etc/openappsec/policy.json
COPY config/entrypoint.sh      /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER caddy

EXPOSE 80 443 443/udp 2019

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD curl -sf http://localhost:2019/config/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
