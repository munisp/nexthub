# ── Build Stage ───────────────────────────────────────────────────────────────
FROM rust:1.78-slim-bookworm AS builder

# Install system deps for rdkafka cmake-build and sqlx
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake libssl-dev pkg-config libsasl2-dev libzstd-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml ./
# Pre-build deps for layer caching
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release || true
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 libsasl2-2 libzstd1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/face-bias-audit /app/face-bias-audit

EXPOSE 8230
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:8230/health || exit 1

CMD ["/app/face-bias-audit"]
