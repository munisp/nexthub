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
import { eq, desc } from "drizzle-orm";

const HSM_ADAPTER_URL = process.env.HSM_ADAPTER_GRPC_REST_URL ?? "http://hsm-adapter:8221";

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
      } catch (err) {
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

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_ONBOARDED, {
        eventType:  "HSM_KEY_GENERATED",
        keyLabel:   input.label,
        keyType:    input.keyType,
        generatedBy: ctx.user!.email,
        timestamp:  new Date().toISOString(),
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

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_ONBOARDED, {
        eventType:    "HSM_KEY_ROTATED",
        oldLabel:     input.currentLabel,
        newLabel:     input.newLabel,
        keyType:      input.keyType,
        rotatedBy:    ctx.user!.email,
        timestamp:    new Date().toISOString(),
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
