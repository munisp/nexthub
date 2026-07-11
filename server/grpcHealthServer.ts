/**
 * grpcHealthServer.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the standard gRPC Health Checking Protocol (grpc.health.v1).
 * Used by Kubernetes liveness/readiness probes and gRPC load balancers.
 *
 * Protocol: https://github.com/grpc/grpc/blob/master/doc/health-checking.md
 *
 * The health status is dynamically computed:
 *   SERVING     — DB connection is reachable
 *   NOT_SERVING — DB is unreachable (startup or failure)
 *
 * Usage: call addHealthService(server) before server.bindAsync()
 */

import * as grpc from "@grpc/grpc-js";
import { getDb } from "./db";
import { logger } from "./logger";

// ─── Health status enum (matches grpc.health.v1.HealthCheckResponse.ServingStatus) ──
const ServingStatus = {
  UNKNOWN: 0,
  SERVING: 1,
  NOT_SERVING: 2,
  SERVICE_UNKNOWN: 3,
} as const;

// ─── In-memory status store ───────────────────────────────────────────────────
const serviceStatuses = new Map<string, number>([
  ["", ServingStatus.SERVING],              // overall server status
  ["nexthub.TransferService", ServingStatus.SERVING],
  ["nexthub.QuoteService", ServingStatus.SERVING],
  ["nexthub.FxRateService", ServingStatus.SERVING],
  ["nexthub.NdcLimitService", ServingStatus.SERVING],
  ["nexthub.ParticipantService", ServingStatus.SERVING],
]);

// ─── Periodic DB health check ─────────────────────────────────────────────────
let _healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function startHealthCheckLoop() {
  if (_healthCheckInterval) return;
  _healthCheckInterval = setInterval(async () => {
    try {
      const db = await getDb();
      if (!db) throw new Error("DB not initialised");
      // Lightweight ping
      await db.execute({ sql: "SELECT 1", params: [] } as any);
      // Mark all services SERVING
      for (const key of serviceStatuses.keys()) {
        serviceStatuses.set(key, ServingStatus.SERVING);
      }
    } catch (err: any) {
      logger.warn("[grpc-health] DB health check failed — marking NOT_SERVING", {
        error: err?.message,
      });
      for (const key of serviceStatuses.keys()) {
        serviceStatuses.set(key, ServingStatus.NOT_SERVING);
      }
    }
  }, 15_000); // every 15 seconds
}

// ─── Health service implementation ───────────────────────────────────────────
const healthServiceImpl = {
  check(call: any, callback: any) {
    const service = call.request?.service ?? "";
    const status = serviceStatuses.get(service) ?? ServingStatus.SERVICE_UNKNOWN;
    callback(null, { status });
  },

  watch(call: any) {
    const service = call.request?.service ?? "";
    // Send initial status
    const status = serviceStatuses.get(service) ?? ServingStatus.SERVICE_UNKNOWN;
    call.write({ status });

    // Poll and push updates every 5 seconds
    const interval = setInterval(() => {
      const currentStatus = serviceStatuses.get(service) ?? ServingStatus.SERVICE_UNKNOWN;
      try {
        call.write({ status: currentStatus });
      } catch {
        clearInterval(interval);
      }
    }, 5_000);

    call.on("cancelled", () => clearInterval(interval));
    call.on("error", () => clearInterval(interval));
  },
};

// ─── Inline proto definition for grpc.health.v1 ──────────────────────────────
// We define the health service inline to avoid requiring an extra .proto file.
const HEALTH_PROTO_INLINE = `
syntax = "proto3";
package grpc.health.v1;
message HealthCheckRequest { string service = 1; }
message HealthCheckResponse {
  enum ServingStatus {
    UNKNOWN = 0;
    SERVING = 1;
    NOT_SERVING = 2;
    SERVICE_UNKNOWN = 3;
  }
  ServingStatus status = 1;
}
service Health {
  rpc Check(HealthCheckRequest) returns (HealthCheckResponse);
  rpc Watch(HealthCheckRequest) returns (stream HealthCheckResponse);
}
`;

/**
 * Adds the grpc.health.v1.Health service to an existing gRPC server.
 * Call this before server.bindAsync().
 */
export function addHealthService(server: grpc.Server) {
  try {
    const protoLoader = require("@grpc/proto-loader");
    const tmpFile = require("os").tmpdir() + "/nexthub_health.proto";
    require("fs").writeFileSync(tmpFile, HEALTH_PROTO_INLINE);

    const packageDef = protoLoader.loadSync(tmpFile, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcObj = grpc.loadPackageDefinition(packageDef) as any;
    const HealthService = grpcObj?.grpc?.health?.v1?.Health;

    if (HealthService?.service) {
      server.addService(HealthService.service, healthServiceImpl);
      startHealthCheckLoop();
      logger.info("[grpc-health] Health check service registered (grpc.health.v1)");
    }
  } catch (err: any) {
    logger.warn("[grpc-health] Could not register health service", { error: err?.message });
  }
}

/**
 * Update the serving status of a specific service (e.g., after a dependency failure).
 */
export function setServiceStatus(service: string, status: keyof typeof ServingStatus) {
  serviceStatuses.set(service, ServingStatus[status]);
}
