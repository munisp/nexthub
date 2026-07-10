FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build 2>/dev/null || true

FROM node:22-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY --from=builder /app .
EXPOSE 3001 50051
HEALTHCHECK --interval=15s --timeout=10s --retries=3 CMD curl -sf http://localhost:3001/api/trpc || exit 1
CMD ["pnpm", "start"]
