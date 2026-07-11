/**
 * nexthubIdentityDirectory.ts — National Identity Directory tRPC Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Bridges the NextHub tRPC API to the Rust identity-directory service and
 * the Python biometric-verifier service. Provides:
 *   - Alias CRUD (create, resolve, update, delete)
 *   - BVN and NIN biometric verification
 *   - Alias lookup by phone, email, BVN, NIN
 *   - Bulk alias import for DFSP onboarding
 *   - Verification audit trail
 *
 * Language: TypeScript (tRPC v11)
 */
import { z } from "zod/v4";
import { router, protectedProcedure, hubOperatorProcedure } from "../_core/trpc";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";

const DICT_SERVICE_URL = process.env.DICT_SERVICE_URL ?? "http://identity-directory:8200";
const BIOMETRIC_SERVICE_URL = process.env.BIOMETRIC_SERVICE_URL ?? "http://biometric-verifier:8210";

// ─── Shared fetch helper ──────────────────────────────────────────────────────

async function dictFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${DICT_SERVICE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DICT service error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

async function biometricFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BIOMETRIC_SERVICE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Biometric service error ${res.status}: ${errBody}`);
  }
  return res.json() as Promise<T>;
}

// ─── Input schemas ────────────────────────────────────────────────────────────

const AliasTypeEnum = z.enum(["PHONE", "EMAIL", "BVN", "NIN", "TAX_ID", "NATIONAL_ID", "PASSPORT_NUMBER", "CUSTOM"]);

const CreateAliasInput = z.object({
  aliasValue:  z.string().min(3).max(100),
  aliasType:   AliasTypeEnum,
  nuban:       z.string().length(10),
  bankCode:    z.string().length(3),
  bic:         z.string().optional(),
  accountName: z.string().min(2).max(100),
  dfspId:      z.string(),
  tenantId:    z.string().optional(),
  verified:    z.boolean().optional(),
});

// ─── Router ───────────────────────────────────────────────────────────────────

export const nexthubIdentityDirectoryRouter = router({

  // ── Resolve an alias ────────────────────────────────────────────────────────
  resolve: protectedProcedure
    .input(z.object({ aliasValue: z.string().min(3) }))
    .query(async ({ input }) => {
      const cacheKey = `dict:resolve:${input.aliasValue}`;
      const cached = await cache.get("identity", cacheKey);
      if (cached) return cached;

      const result = await dictFetch<Record<string, unknown>>(`/v1/aliases/${encodeURIComponent(input.aliasValue)}`);
      await cache.set("identity", cacheKey, result, TTL.SHORT);
      return result;
    }),

  // ── Resolve by phone ────────────────────────────────────────────────────────
  resolveByPhone: protectedProcedure
    .input(z.object({ phone: z.string().min(10).max(15) }))
    .query(async ({ input }) => {
      return dictFetch<Record<string, unknown>>(`/v1/aliases/phone/${encodeURIComponent(input.phone)}`);
    }),

  // ── Resolve by BVN ──────────────────────────────────────────────────────────
  resolveByBvn: protectedProcedure
    .input(z.object({ bvn: z.string().length(11) }))
    .query(async ({ input }) => {
      return dictFetch<Record<string, unknown>>(`/v1/aliases/bvn/${input.bvn}`);
    }),

  // ── Resolve by NIN ──────────────────────────────────────────────────────────
  resolveByNin: protectedProcedure
    .input(z.object({ nin: z.string().length(11) }))
    .query(async ({ input }) => {
      return dictFetch<Record<string, unknown>>(`/v1/aliases/nin/${input.nin}`);
    }),

  // ── Create alias ────────────────────────────────────────────────────────────
  createAlias: hubOperatorProcedure
    .input(CreateAliasInput)
    .mutation(async ({ input, ctx }) => {
      const result = await dictFetch<Record<string, unknown>>("/v1/aliases", {
        method: "POST",
        body: JSON.stringify({
          alias_value:  input.aliasValue,
          alias_type:   input.aliasType,
          nuban:        input.nuban,
          bank_code:    input.bankCode,
          bic:          input.bic,
          account_name: input.accountName,
          dfsp_id:      input.dfspId,
          tenant_id:    input.tenantId,
          verified:     input.verified,
        }),
      });

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_ONBOARDED, {
        eventType: "ALIAS_CREATED",
        aliasType: input.aliasType,
        dfspId:    input.dfspId,
        createdBy: ctx.user!.email,
        timestamp: new Date().toISOString(),
      });

      logger.info("alias_created", { aliasType: input.aliasType, dfspId: input.dfspId });
      return result;
    }),

  // ── Update alias ────────────────────────────────────────────────────────────
  updateAlias: hubOperatorProcedure
    .input(z.object({ aliasValue: z.string(), update: CreateAliasInput }))
    .mutation(async ({ input }) => {
      return dictFetch<Record<string, unknown>>(`/v1/aliases/${encodeURIComponent(input.aliasValue)}`, {
        method: "PUT",
        body: JSON.stringify({
          alias_value:  input.update.aliasValue,
          alias_type:   input.update.aliasType,
          nuban:        input.update.nuban,
          bank_code:    input.update.bankCode,
          bic:          input.update.bic,
          account_name: input.update.accountName,
          dfsp_id:      input.update.dfspId,
          tenant_id:    input.update.tenantId,
        }),
      });
    }),

  // ── Delete alias ────────────────────────────────────────────────────────────
  deleteAlias: hubOperatorProcedure
    .input(z.object({ aliasValue: z.string(), reason: z.string().min(5) }))
    .mutation(async ({ input, ctx }) => {
      await dictFetch<Record<string, unknown>>(`/v1/aliases/${encodeURIComponent(input.aliasValue)}`, {
        method: "DELETE",
      });

      logger.info("alias_deleted", { aliasValue: input.aliasValue, deletedBy: ctx.user!.email, reason: input.reason });
      return { success: true };
    }),

  // ── BVN Verification ────────────────────────────────────────────────────────
  verifyBvn: protectedProcedure
    .input(z.object({
      bvn:         z.string().length(11),
      firstName:   z.string().optional(),
      lastName:    z.string().optional(),
      dateOfBirth: z.string().optional(),
      tenantId:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return biometricFetch<Record<string, unknown>>("/v1/verify/bvn", {
        bvn:           input.bvn,
        first_name:    input.firstName,
        last_name:     input.lastName,
        date_of_birth: input.dateOfBirth,
        tenant_id:     input.tenantId,
      });
    }),

  // ── NIN Verification ────────────────────────────────────────────────────────
  verifyNin: protectedProcedure
    .input(z.object({
      nin:         z.string().length(11),
      firstName:   z.string().optional(),
      lastName:    z.string().optional(),
      dateOfBirth: z.string().optional(),
      tenantId:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return biometricFetch<Record<string, unknown>>("/v1/verify/nin", {
        nin:           input.nin,
        first_name:    input.firstName,
        last_name:     input.lastName,
        date_of_birth: input.dateOfBirth,
        tenant_id:     input.tenantId,
      });
    }),

  // ── List aliases by account ─────────────────────────────────────────────────
  listByAccount: protectedProcedure
    .input(z.object({ nuban: z.string().length(10), tenantId: z.string().optional() }))
    .query(async ({ input }) => {
      const qs = input.tenantId ? `?tenant_id=${input.tenantId}` : "";
      return dictFetch<unknown[]>(`/v1/aliases/account/${input.nuban}${qs}`);
    }),

  // ── Bulk alias import ───────────────────────────────────────────────────────
  bulkImport: hubOperatorProcedure
    .input(z.object({
      aliases: z.array(CreateAliasInput).min(1).max(1000),
      dfspId:  z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const results = await Promise.allSettled(
        input.aliases.map(alias =>
          dictFetch<Record<string, unknown>>("/v1/aliases", {
            method: "POST",
            body: JSON.stringify({
              alias_value:  alias.aliasValue,
              alias_type:   alias.aliasType,
              nuban:        alias.nuban,
              bank_code:    alias.bankCode,
              bic:          alias.bic,
              account_name: alias.accountName,
              dfsp_id:      alias.dfspId,
              tenant_id:    alias.tenantId,
            }),
          })
        )
      );

      const succeeded = results.filter(r => r.status === "fulfilled").length;
      const failed    = results.filter(r => r.status === "rejected").length;

      logger.info("bulk_alias_import", {
        dfspId:    input.dfspId,
        total:     input.aliases.length,
        succeeded,
        failed,
        importedBy: ctx.user!.email,
      });

      return { total: input.aliases.length, succeeded, failed };
    }),
});
