FROM rust:1.77-alpine AS builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
# Cache deps layer
RUN mkdir src && echo "fn main(){}" > src/main.rs && cargo build --release && rm -rf src
COPY src ./src
RUN touch src/main.rs && cargo build --release

FROM alpine:3.19
RUN apk add --no-cache ca-certificates curl
WORKDIR /app
COPY --from=builder /app/target/release/nexthub-ledger .
EXPOSE 8090
HEALTHCHECK --interval=10s --timeout=5s --retries=3 CMD curl -sf http://localhost:8090/health || exit 1
CMD ["./nexthub-ledger"]
