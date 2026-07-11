/**
 * nexthubHsm.ts — HSM Management tRPC Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Provides hub operators with visibility and control over the HSM adapter:
 *   - List all keys in the HSM
 *   - Generate new key pairs
 *   - Rotate JWS signing keys
 *   - Check HSM health and mode (hardware vs software)
 *   - Sign a test payload (for integration verification)
 *
 * All operations are restricted to hubOperatorProcedure (RBAC enforced).
 *
 * Language: TypeScript (tRPC v11)
 */
import { z } from "zod/v4";
import { router, hubOperatorProcedure } from "../_core/trpc";
import { logger } from "../logger";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";
import { db } from "../db";
import { hsmKeys, hsmOperations, keyRotationLog } from "../../drizzle/national_switch_schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const HSM_ADAPTER_URL = process.env.HSM_ADAPTER_GRPC_REST_URL ?? "http://hsm-adapter:8221";

// Map user-facing key type strings to the DB enum values
const KEY_TYPE_MAP: Record<string, "RSA_2048" | "RSA_4096" | "EC_P256" | "EC_P384"> = {
  "RSA-2048": "RSA_2048",
  "RSA-4096": "RSA_4096",
  "EC-P256":  "EC_P256",
  "EC-P384":  "EC_P384",
};

async function hsmFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${HSM_ADAPTER_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HSM adapter error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const nexthubHsmRouter = router({

  // ── Health check ────────────────────────────────────────────────────────────
  health: hubOperatorProcedure
    .query(async () => {
      try {
        const result = await hsmFetch<{ status: string; mode: string }>("/health");
        return { online: true, ...result };
      } catch {
        return { online: false, status: "unreachable", mode: "unknown" };
      }
    }),

  // ── List all keys ────────────────────────────────────────────────────────────
  listKeys: hubOperatorProcedure
    .query(async () => {
      return hsmFetch<{ keys: Array<{ label: string; keyType: string; extractable: boolean }> }>("/v1/keys");
    }),

  // ── Generate key pair ────────────────────────────────────────────────────────
  generateKeyPair: hubOperatorProcedure
    .input(z.object({
      label:   z.string().min(3).max(64),
      keyType: z.enum(["RSA-2048", "RSA-4096", "EC-P256", "EC-P384"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await hsmFetch<{ success: boolean; label: string }>("/v1/keys/generate", {
        method: "POST",
        body: JSON.stringify({ label: input.label, key_type: input.keyType }),
      });

      const keyId = randomUUID();
      const dbKeyType = KEY_TYPE_MAP[input.keyType];

      // Persist key record to Postgres
      await db.insert(hsmKeys).values({
        id: keyId,
        keyLabel: input.label,
        keyType: dbKeyType,
        keyStatus: "ACTIVE",
        purpose: "JWS_SIGNING",
        algorithm: input.keyType.startsWith("RSA") ? "RSA-SHA256" : "ECDSA-SHA256",
        slotId: 0,
        tenantId: ctx.user!.id.toString(),
        generatedBy: ctx.user!.email ?? "system",
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000), // 1 year default
      }).onConflictDoNothing();

      // Persist operation log
      await db.insert(hsmOperations).values({
        id: randomUUID(),
        keyId,
        keyLabel: input.label,
        operationType: "GENERATE_KEY_PAIR",
        callerService: "nexthub-core",
        tenantId: ctx.user!.id.toString(),
        success: true,
      }).catch(() => {});

      // Publish Kafka event
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.HSM_KEY_EVENT, {
        keyLabel:    input.label,
        keyType:     input.keyType,
        eventType:   "GENERATED" as const,
        performedBy: ctx.user!.email,
        timestamp:   new Date().toISOString(),
      });

      logger.info("hsm.key_generated", { label: input.label, keyType: input.keyType, by: ctx.user!.email });
      return result;
    }),

  // ── Rotate JWS signing key ───────────────────────────────────────────────────
  rotateJwsKey: hubOperatorProcedure
    .input(z.object({
      currentLabel: z.string(),
      newLabel:     z.string().min(3).max(64),
      keyType:      z.enum(["RSA-2048", "RSA-4096", "EC-P256", "EC-P384"]).default("EC-P256"),
    }))
    .mutation(async ({ input, ctx }) => {
      // Step 1: Generate the new key pair
      const newKey = await hsmFetch<{ success: boolean; label: string }>("/v1/keys/generate", {
        method: "POST",
        body: JSON.stringify({ label: input.newLabel, key_type: input.keyType }),
      });

      // Step 2: Retire the old key (mark as inactive in HSM metadata)
      await hsmFetch("/v1/keys/retire", {
        method: "POST",
        body: JSON.stringify({ label: input.currentLabel }),
      });

      const newKeyId = randomUUID();
      const dbKeyType = KEY_TYPE_MAP[input.keyType];

      // Persist new key to Postgres
      await db.insert(hsmKeys).values({
        id: newKeyId,
        keyLabel: input.newLabel,
        keyType: dbKeyType,
        keyStatus: "ACTIVE",
        purpose: "JWS_SIGNING",
        algorithm: input.keyType.startsWith("RSA") ? "RSA-SHA256" : "ECDSA-SHA256",
        slotId: 0,
        tenantId: ctx.user!.id.toString(),
        generatedBy: ctx.user!.email ?? "system",
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      }).onConflictDoNothing();

      // Mark old key as PENDING_ROTATION in Postgres
      await db.update(hsmKeys)
        .set({ keyStatus: "PENDING_ROTATION", updatedAt: new Date() })
        .where(eq(hsmKeys.keyLabel, input.currentLabel))
        .catch(() => {});

      // Persist rotation log
      await db.insert(keyRotationLog).values({
        id: randomUUID(),
        tenantId: ctx.user!.id.toString(),
        oldKeyId: input.currentLabel,
        newKeyId: newKeyId,
        rotationReason: "MANUAL",
        initiatedBy: ctx.user!.email ?? "system",
        rotationStartedAt: new Date(),
        rotationCompletedAt: new Date(),
      }).catch(() => {});

      // Publish Kafka event
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.HSM_KEY_EVENT, {
        keyLabel:    input.newLabel,
        keyType:     input.keyType,
        eventType:   "ROTATED" as const,
        performedBy: ctx.user!.email,
        timestamp:   new Date().toISOString(),
      });

      logger.info("hsm.jws_key_rotated", {
        oldLabel: input.currentLabel,
        newLabel: input.newLabel,
        by:       ctx.user!.email,
      });

      return { success: true, newLabel: newKey.label };
    }),

  // ── Sign test payload ────────────────────────────────────────────────────────
  signTest: hubOperatorProcedure
    .input(z.object({
      keyLabel:  z.string(),
      algorithm: z.enum(["RSA-SHA256", "ECDSA-SHA256"]),
      payload:   z.string().max(1024),
    }))
    .mutation(async ({ input }) => {
      return hsmFetch<{ signature: string; algorithm: string }>("/v1/sign", {
        method: "POST",
        body: JSON.stringify({
          key_label:  input.keyLabel,
          algorithm:  input.algorithm,
          data:       Buffer.from(input.payload).toString("base64"),
        }),
      });
    }),

  // ── Compute HMAC test ────────────────────────────────────────────────────────
  computeMacTest: hubOperatorProcedure
    .input(z.object({
      keyLabel: z.string(),
      data:     z.string().max(1024),
    }))
    .mutation(async ({ input }) => {
      return hsmFetch<{ mac: string }>("/v1/mac", {
        method: "POST",
        body: JSON.stringify({
          key_label: input.keyLabel,
          data:      Buffer.from(input.data).toString("base64"),
        }),
      });
    }),
});
