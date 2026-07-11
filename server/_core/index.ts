/**
 * server/_core/index.ts — NextHub Server Entry Point
 * ─────────────────────────────────────────────────────────────────────────────
 * Starts the full NextHub stack:
 *
 *   [Express / HTTP]
 *   - tRPC at /api/trpc           → NextHub Admin + Regulator Portal frontend
 *   - REST API at /api/v1         → Paygate and other DFSP clients
 *   - SSE at /api/ndc-breach-stream → Real-time NDC breach feed
 *   - SSE at /api/fx-stream       → Live FX rate ticks
 *   - Static file serving         → Vite-built frontend
 *
 *   [gRPC]
 *   - Port 50051                  → Critical-path RPC (transfers, quotes, FX, NDC)
 *
 *   [Kafka]
 *   - Producers: nexthub.transfer.*, nexthub.fx.rates.v1, nexthub.ndc.breach.v1,
 *                nexthub.settlement.*, nexthub.participant.status.v1
 *   - Consumers: paygate.audit.v1, paygate.corridor.volume.v1
 *
 *   [Fluvio]
 *   - Producers: ndc-breach-alerts, fx-rate-ticks, settlement-updates
 *   - Consumers: paygate-tx-stream
 *
 *   [Background Jobs]
 *   - Billing overdue sweep (every 15 min)
 *   - PISP consent expiry (every 5 min)
 *   - Dispute SLA escalation (every 10 min)
 *   - Settlement stale-OPEN scan (every 30 min)
 */

import express from "express";
import compression from "compression";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createIntegrationRouter } from "../integrationApi";
import { ndcBreachStreamHandler } from "../ndcBreachStream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [
    "http://localhost:3000",
    "http://localhost:5173",
  ],
  credentials: true,
}));
app.use(compression({ level: 6, threshold: 1024 })); // gzip responses > 1KB
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

// ─── tRPC (NextHub Admin + Regulator Portal frontend) ────────────────────────
app.use(
  "/api/trpc",
  createExpressMiddleware({ router: appRouter, createContext }),
);

// ─── REST Integration API (Paygate DFSP client) ───────────────────────────────
app.use("/api/v1", createIntegrationRouter());

// ─── NDC Breach SSE Stream ───────────────────────────────────────────────────
app.get("/api/ndc-breach-stream", ndcBreachStreamHandler);

// ─── FX Rate SSE Stream (Fluvio fan-out) ─────────────────────────────────────
app.get("/api/fx-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(": connected\n\n");

  import("../fluvio/nexthubFluvioProducer").then(({ NEXTHUB_FLUVIO_TOPICS }) => {
    import("./fxSseRegistry").then(({ addFxSseSubscriber }) => {
      addFxSseSubscriber(res as any);
    }).catch(() => {});
  }).catch(() => {});

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30_000);
  req.on("close", () => clearInterval(heartbeat));
});

// ─── Static frontend (production) ────────────────────────────────────────────
const distPath = path.resolve(__dirname, "../../dist/public");
app.use(express.static(distPath));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ─── Start ────────────────────────────────────────────────────────────────────
async function startServer() {
  // 1. HTTP server — capture the server handle for graceful drain
  const httpServer = app.listen(PORT, () => {
    console.log(`[nexthub-core] HTTP server on port ${PORT}`);
    console.log(`[nexthub-core] tRPC:            http://localhost:${PORT}/api/trpc`);
    console.log(`[nexthub-core] REST API:         http://localhost:${PORT}/api/v1`);
    console.log(`[nexthub-core] NDC SSE:          http://localhost:${PORT}/api/ndc-breach-stream`);
    console.log(`[nexthub-core] FX SSE:           http://localhost:${PORT}/api/fx-stream`);
  });

  // 2. gRPC server (critical-path RPC for Paygate)
  try {
    const { startGrpcServer } = await import("../grpcServer");
    startGrpcServer();
  } catch (e: any) {
    console.warn("[nexthub-core] gRPC server failed to start:", e?.message);
  }

  // 3. Kafka producers (lazy — only connect when first message is published)
  console.log("[nexthub-core] Kafka producer ready (lazy connect)");

  // 4. Kafka consumers (materialise Paygate events into NextHub read-model)
  try {
    const { startAllConsumers } = await import("../kafka/nexthubKafkaConsumer");
    await startAllConsumers();
  } catch (e: any) {
    console.warn("[nexthub-core] Kafka consumers failed to start:", e?.message);
  }

  // 5. Fluvio consumers (real-time Paygate TX stream)
  try {
    const { startAllFluvioConsumers } = await import("../fluvio/nexthubFluvioConsumer");
    await startAllFluvioConsumers();
  } catch (e: any) {
    console.warn("[nexthub-core] Fluvio consumers failed to start:", e?.message);
  }

  // 6. Background jobs (billing overdue, PISP expiry, dispute SLA, settlement stale scan)
  try {
    const { startBackgroundJobs } = await import("../backgroundJobs");
    startBackgroundJobs();
  } catch (e: any) {
    console.warn("[nexthub-core] Background jobs failed to start:", e?.message);
  }

  // 7. Graceful shutdown with HTTP connection drain
  const shutdown = async (signal: string) => {
    console.log(`[nexthub-core] ${signal} received — draining HTTP connections`);

    // Stop accepting new connections; wait for in-flight requests to finish
    httpServer.close(async () => {
      console.log("[nexthub-core] HTTP server drained — disconnecting Kafka");
      try {
        const { disconnectKafkaProducer } = await import("../kafka/nexthubKafkaProducer");
        await disconnectKafkaProducer();
      } catch {}
      console.log("[nexthub-core] Shutdown complete");
      process.exit(0);
    });

    // Force-exit after 30 s if drain takes too long
    setTimeout(() => {
      console.error("[nexthub-core] Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 30_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(err => {
  console.error("[nexthub-core] Fatal startup error:", err);
  process.exit(1);
});

export { app };
