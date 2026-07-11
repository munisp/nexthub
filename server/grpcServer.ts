/**
 * grpcServer.ts — NextHub gRPC Server
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements all four gRPC services defined in proto/nexthub.proto:
 *   - TransferService    — cross-border transfer lifecycle
 *   - QuoteService       — pre-transfer fee/FX calculation
 *   - FxRateService      — live FX rate lookup
 *   - NdcLimitService    — net debit cap checks
 *   - ParticipantService — DFSP directory
 *
 * Binds on port 50051 (configurable via NEXTHUB_GRPC_PORT env var).
 * Uses @grpc/grpc-js (pure Node.js, no native bindings required).
 */

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { eq, and, lte, gte, desc, sql } from "drizzle-orm";
import { getDb } from "./db";
import {
  nexthubTransfers,
  nexthubFxRates,
  dfspNdcLimits,
  nexthubParticipantLimits,
  nexthubParticipantPositions,
  nexthubDfsps,
} from "../drizzle/nexthub_schema";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "./kafka/nexthubKafkaProducer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROTO_PATH = path.resolve(__dirname, "../proto/nexthub.proto");
const GRPC_PORT = Number(process.env.NEXTHUB_GRPC_PORT ?? 50051);

// ─── Proto loader ─────────────────────────────────────────────────────────────
let _packageDef: protoLoader.PackageDefinition | null = null;
function getPackageDef() {
  if (!_packageDef) {
    _packageDef = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
  }
  return _packageDef;
}

function getProto(): any {
  return grpc.loadPackageDefinition(getPackageDef());
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function grpcError(code: grpc.status, message: string): grpc.ServiceError {
  const err = new Error(message) as grpc.ServiceError;
  err.code = code;
  return err;
}

// ─── TransferService ──────────────────────────────────────────────────────────
const transferServiceImpl = {
  async initiateTransfer(call: any, callback: any) {
    try {
      const req = call.request;
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      // Idempotency check
      const [existing] = await db.select().from(nexthubTransfers)
        .where(eq(nexthubTransfers.id, req.transferId)).limit(1);
      if (existing) {
        return callback(null, {
          transferId: existing.id,
          state: existing.state,
          schemeFeeKobo: String(existing.schemeFeeKobo ?? 0),
          interchangeFeeKobo: String(existing.interchangeFeeKobo ?? 0),
          fxRate: existing.fxRate ?? 1.0,
          errorCode: existing.errorCode ?? "",
          errorDescription: existing.errorDescription ?? "",
          createdAtMs: String(existing.createdAt.getTime()),
        });
      }

      // Calculate scheme fee (simplified — real impl uses dfspFeeTiers)
      const amountKobo = Number(req.amountKobo);
      const schemeFeeKobo = Math.round(amountKobo * 0.001); // 0.1% flat
      const interchangeFeeKobo = Math.round(amountKobo * 0.0005); // 0.05%

      const [transfer] = await db.insert(nexthubTransfers).values({
        id: req.transferId || randomUUID(),
        payerFspId: req.payerFspId,
        payeeFspId: req.payeeFspId,
        payerPartyId: req.payerPartyId,
        payeePartyId: req.payeePartyId,
        amountKobo,
        currency: req.currency || "NGN",
        state: "RECEIVED",
        ilpPacket: req.ilpPacket || null,
        condition: req.condition || null,
        schemeFeeKobo,
        interchangeFeeKobo,
        expirationTime: req.expirationMs ? new Date(Number(req.expirationMs)) : null,
      }).returning();

      // Publish to Kafka for async downstream processing
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_RECEIVED, {
        transferId: transfer.id,
        payerFspId: transfer.payerFspId,
        payeeFspId: transfer.payeeFspId,
        amountKobo: transfer.amountKobo,
        currency: transfer.currency,
        state: transfer.state,
        timestamp: transfer.createdAt.toISOString(),
      });

      callback(null, {
        transferId: transfer.id,
        state: transfer.state,
        schemeFeeKobo: String(schemeFeeKobo),
        interchangeFeeKobo: String(interchangeFeeKobo),
        fxRate: 1.0,
        errorCode: "",
        errorDescription: "",
        createdAtMs: String(transfer.createdAt.getTime()),
      });
    } catch (err: any) {
      console.error("[grpcServer] initiateTransfer error:", err);
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async getTransferStatus(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const [transfer] = await db.select().from(nexthubTransfers)
        .where(eq(nexthubTransfers.id, call.request.transferId)).limit(1);

      if (!transfer) {
        return callback(grpcError(grpc.status.NOT_FOUND, `Transfer ${call.request.transferId} not found`));
      }

      callback(null, {
        transferId: transfer.id,
        state: transfer.state,
        amountKobo: String(transfer.amountKobo),
        currency: transfer.currency,
        schemeFeeKobo: String(transfer.schemeFeeKobo ?? 0),
        interchangeFeeKobo: String(transfer.interchangeFeeKobo ?? 0),
        fulfilment: transfer.fulfilment ?? "",
        errorCode: transfer.errorCode ?? "",
        errorDescription: transfer.errorDescription ?? "",
        createdAtMs: String(transfer.createdAt.getTime()),
        updatedAtMs: String(transfer.updatedAt.getTime()),
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async abortTransfer(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const [updated] = await db.update(nexthubTransfers)
        .set({
          state: "ABORTED",
          errorCode: call.request.errorCode,
          errorDescription: call.request.errorDescription,
          updatedAt: new Date(),
        })
        .where(and(
          eq(nexthubTransfers.id, call.request.transferId),
          sql`state NOT IN ('COMMITTED', 'ABORTED')`,
        ))
        .returning();

      if (!updated) {
        return callback(grpcError(grpc.status.FAILED_PRECONDITION, "Transfer cannot be aborted in its current state"));
      }

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_ABORTED, {
        transferId: updated.id,
        errorCode: updated.errorCode,
        errorDescription: updated.errorDescription,
        timestamp: new Date().toISOString(),
      });

      callback(null, { success: true, state: "ABORTED", message: "Transfer aborted" });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async fulfilTransfer(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const [existing] = await db.select().from(nexthubTransfers)
        .where(eq(nexthubTransfers.id, call.request.transferId)).limit(1);

      if (!existing) {
        return callback(grpcError(grpc.status.NOT_FOUND, "Transfer not found"));
      }
      if (existing.state !== "RESERVED") {
        return callback(grpcError(grpc.status.FAILED_PRECONDITION, `Cannot fulfil transfer in state ${existing.state}`));
      }

      const [updated] = await db.update(nexthubTransfers)
        .set({ state: "COMMITTED", fulfilment: call.request.fulfilment, updatedAt: new Date() })
        .where(eq(nexthubTransfers.id, call.request.transferId))
        .returning();

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_COMMITTED, {
        transferId: updated.id,
        payerFspId: updated.payerFspId,
        payeeFspId: updated.payeeFspId,
        amountKobo: updated.amountKobo,
        currency: updated.currency,
        schemeFeeKobo: updated.schemeFeeKobo,
        timestamp: new Date().toISOString(),
      });

      callback(null, {
        success: true,
        state: "COMMITTED",
        schemeFeeKobo: String(updated.schemeFeeKobo ?? 0),
        message: "Transfer committed",
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },
};

// ─── QuoteService ─────────────────────────────────────────────────────────────
const quoteServiceImpl = {
  async requestQuote(call: any, callback: any) {
    try {
      const req = call.request;
      const amountKobo = Number(req.amountKobo);

      // Get live FX rate
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const now = new Date();
      const [fxRate] = await db.select().from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, req.currency || "NGN"),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(1);

      const rate = fxRate ? Number(fxRate.rate) : 1.0;
      const schemeFeeKobo = Math.round(amountKobo * 0.001);
      const interchangeFeeKobo = Math.round(amountKobo * 0.0005);
      const fxMarkupKobo = Math.round(amountKobo * 0.002);
      const payeeReceiveKobo = amountKobo - schemeFeeKobo - interchangeFeeKobo - fxMarkupKobo;
      const expiryMs = Date.now() + 30_000; // 30 second quote validity

      callback(null, {
        quoteId: req.quoteId || randomUUID(),
        state: "ACCEPTED",
        transferAmountKobo: String(amountKobo),
        payeeReceiveKobo: String(payeeReceiveKobo),
        schemeFeeKobo: String(schemeFeeKobo),
        interchangeFeeKobo: String(interchangeFeeKobo),
        fxMarkupKobo: String(fxMarkupKobo),
        fxRate: rate,
        ilpPacket: "",
        condition: "",
        expiryMs: String(expiryMs),
        errorCode: "",
        errorDescription: "",
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async getQuote(call: any, callback: any) {
    // Quotes are ephemeral — return NOT_FOUND if expired
    callback(grpcError(grpc.status.NOT_FOUND, "Quote not found or expired. Request a new quote."));
  },
};

// ─── FxRateService ────────────────────────────────────────────────────────────
const fxRateServiceImpl = {
  async getLiveRate(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const now = new Date();
      const [rate] = await db.select().from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, call.request.sourceCurrency),
          eq(nexthubFxRates.targetCurrency, call.request.targetCurrency),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.createdAt))
        .limit(1);

      if (!rate) {
        return callback(grpcError(grpc.status.NOT_FOUND, `No active rate for ${call.request.sourceCurrency}/${call.request.targetCurrency}`));
      }

      const isStale = rate.createdAt ? (now.getTime() - rate.createdAt.getTime()) > 5 * 60 * 1000 : false;
      const midRateNum = Number(rate.rate);

      callback(null, {
        sourceCurrency: rate.sourceCurrency,
        targetCurrency: rate.targetCurrency,
        midRate: midRateNum,
        buyRate: midRateNum * 1.002,
        sellRate: midRateNum * 0.998,
        markupBps: 20,
        validFromMs: String(rate.validFrom.getTime()),
        validToMs: String(rate.validTo.getTime()),
        provider: rate.provider ?? "nexthub",
        isStale,
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async getRateHistory(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const { sourceCurrency, targetCurrency, fromMs, toMs, maxPoints } = call.request;
      const from = new Date(Number(fromMs) || Date.now() - 24 * 3600 * 1000);
      const to = new Date(Number(toMs) || Date.now());
      const limit = Math.min(Number(maxPoints) || 100, 500);

      const rates = await db.select({
        rate: nexthubFxRates.rate,
        createdAt: nexthubFxRates.createdAt,
      }).from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, sourceCurrency),
          eq(nexthubFxRates.targetCurrency, targetCurrency),
          gte(nexthubFxRates.createdAt, from),
          lte(nexthubFxRates.createdAt, to),
        ))
        .orderBy(nexthubFxRates.createdAt)
        .limit(limit);

      callback(null, {
        points: rates.map(r => ({
          midRate: Number(r.rate),
          timestampMs: String(r.createdAt?.getTime() ?? Date.now()),
        })),
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async listRates(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const now = new Date();
      const rates = await db.select().from(nexthubFxRates)
        .where(and(
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
          call.request.baseCurrency ? eq(nexthubFxRates.sourceCurrency, call.request.baseCurrency) : sql`1=1`,
        ))
        .orderBy(nexthubFxRates.sourceCurrency);

      callback(null, {
        rates: rates.map(r => ({
          sourceCurrency: r.sourceCurrency,
          targetCurrency: r.targetCurrency,
          midRate: Number(r.rate),
          buyRate: Number(r.rate) * 1.002,
          sellRate: Number(r.rate) * 0.998,
          markupBps: 20,
          validFromMs: String(r.validFrom.getTime()),
          validToMs: String(r.validTo.getTime()),
          provider: r.provider ?? "nexthub",
          isStale: false,
        })),
        fetchedAtMs: String(now.getTime()),
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },
};

// ─── NdcLimitService ──────────────────────────────────────────────────────────
const ndcLimitServiceImpl = {
  async checkNdcLimit(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const { dfspId, amountKobo, currency } = call.request;

      const [limit] = await db.select().from(dfspNdcLimits)
        .where(eq(dfspNdcLimits.dfspId, dfspId)).limit(1);

      if (!limit) {
        // No limit configured — allow by default
        return callback(null, {
          allowed: true,
          currentPositionKobo: "0",
          ndcLimitKobo: "0",
          availableKobo: "0",
          dfspId,
          currency: currency || "NGN",
        });
      }

      const [position] = await db.select().from(nexthubParticipantPositions)
        .where(eq(nexthubParticipantPositions.participantId, dfspId)).limit(1);

      const currentPositionKobo = Number(position?.currentValue ?? 0);
      const ndcLimitKobo = Number(limit.ndcLimitKobo);
      const requestedKobo = Number(amountKobo);
      const availableKobo = ndcLimitKobo - currentPositionKobo;
      const allowed = (currentPositionKobo + requestedKobo) <= ndcLimitKobo;

      // If this would breach, publish a Kafka event
      if (!allowed) {
        await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.NDC_BREACH, {
          dfspId,
          limitType: "NET_DEBIT_CAP",
          threshold: ndcLimitKobo,
          breachAmount: currentPositionKobo + requestedKobo,
          currency: currency || "NGN",
          timestamp: new Date().toISOString(),
        });
      }

      callback(null, {
        allowed,
        currentPositionKobo: String(currentPositionKobo),
        ndcLimitKobo: String(ndcLimitKobo),
        availableKobo: String(availableKobo),
        dfspId,
        currency: currency || "NGN",
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async getNdcPosition(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const { dfspId, currency } = call.request;

      const [limit] = await db.select().from(dfspNdcLimits)
        .where(eq(dfspNdcLimits.dfspId, dfspId)).limit(1);

      const [position] = await db.select().from(nexthubParticipantPositions)
        .where(eq(nexthubParticipantPositions.participantId, dfspId)).limit(1);

            const currentPositionKobo = Number(position?.currentValue ?? 0);
      const ndcLimitKobo = Number(limit?.ndcLimitKobo ?? 0);
      const availableKobo = ndcLimitKobo - currentPositionKobo;
      const utilisationPct = ndcLimitKobo > 0 ? (currentPositionKobo / ndcLimitKobo) * 100 : 0;
      callback(null, {
        dfspId,
        currency: currency || "NGN",
        currentPositionKobo: String(currentPositionKobo),
        ndcLimitKobo: String(ndcLimitKobo),
        availableKobo: String(availableKobo),
        utilisationPct,
        lastUpdatedMs: String(position?.lastUpdated?.getTime() ?? Date.now()),
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },
};

// ─── ParticipantService ───────────────────────────────────────────────────────
const participantServiceImpl = {
  async lookupParticipant(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const [dfsp] = await db.select().from(nexthubDfsps)
        .where(eq(nexthubDfsps.dfspId, call.request.dfspId)).limit(1);

      if (!dfsp) {
        return callback(null, { found: false, dfspId: call.request.dfspId });
      }

      callback(null, {
        found: true,
        dfspId: dfsp.dfspId,
        dfspName: dfsp.dfspName,
        dfspType: dfsp.dfspType,
        country: dfsp.country,
        currency: dfsp.currency,
        status: dfsp.status,
        callbackUrl: dfsp.callbackUrl ?? "",
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },

  async listParticipants(call: any, callback: any) {
    try {
      const db = await getDb();
      if (!db) return callback(grpcError(grpc.status.UNAVAILABLE, "Database unavailable"));

      const statusFilter = call.request.statusFilter;
      const dfsps = await db.select().from(nexthubDfsps)
        .where(statusFilter && statusFilter !== "ALL" ? eq(nexthubDfsps.status, statusFilter) : sql`1=1`)
        .orderBy(nexthubDfsps.dfspName);

      callback(null, {
        participants: dfsps.map(d => ({
          found: true,
          dfspId: d.dfspId,
          dfspName: d.dfspName,
          dfspType: d.dfspType,
          country: d.country,
          currency: d.currency,
          status: d.status,
          callbackUrl: d.callbackUrl ?? "",
        })),
        total: dfsps.length,
      });
    } catch (err: any) {
      callback(grpcError(grpc.status.INTERNAL, err?.message ?? "Internal error"));
    }
  },
};

// ─── Server bootstrap ─────────────────────────────────────────────────────────
export function startGrpcServer(): grpc.Server {
  const proto = getProto();
  const nexthubProto = proto["nexthub"]?.["v1"] ?? proto;

  const server = new grpc.Server({
    "grpc.max_receive_message_length": 10 * 1024 * 1024, // 10 MB
    "grpc.max_send_message_length": 10 * 1024 * 1024,
    "grpc.keepalive_time_ms": 30_000,
    "grpc.keepalive_timeout_ms": 10_000,
  });

  server.addService(nexthubProto.TransferService.service, transferServiceImpl);
  server.addService(nexthubProto.QuoteService.service, quoteServiceImpl);
  server.addService(nexthubProto.FxRateService.service, fxRateServiceImpl);
  server.addService(nexthubProto.NdcLimitService.service, ndcLimitServiceImpl);
  server.addService(nexthubProto.ParticipantService.service, participantServiceImpl);

  const credentials = process.env.NEXTHUB_GRPC_TLS === "true"
    ? grpc.ServerCredentials.createSsl(null, [])
    : grpc.ServerCredentials.createInsecure();

  server.bindAsync(`0.0.0.0:${GRPC_PORT}`, credentials, (err, port) => {
    if (err) {
      console.error("[grpcServer] Failed to bind:", err);
      return;
    }
    console.log(`[nexthub-core] gRPC server listening on port ${port}`);
  });

  return server;
}
