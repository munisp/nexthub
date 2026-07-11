import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../db";
import {
  reservePispPaymentInLedgerViaMiddleware,
  commitPispPaymentInLedgerViaMiddleware,
  voidPispPaymentInLedgerViaMiddleware,
} from "../middlewareBridge";
import { nexthubPispConsents } from "../../drizzle/nexthub_schema";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nexthubPublish } from "../kafka/nexthubKafkaProducer";

export const nexthubPISPRouter = router({
  // List all PISP consents
  listConsents: protectedProcedure
    .input(z.object({
      pispId: z.string().optional(),
      dfspId: z.string().optional(),
      state: z.enum(["REQUESTED", "GRANTED", "ACTIVE", "REVOKED", "EXPIRED"]).optional(),
      limit: z.number().int().min(1).max(100).default(25),
      offset: z.number().int().min(0).default(0),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.pispId) conditions.push(eq(nexthubPispConsents.pispId, input.pispId));
      if (input?.dfspId) conditions.push(eq(nexthubPispConsents.dfspId, input.dfspId));
      if (input?.state) conditions.push(eq(nexthubPispConsents.state, input.state));

      return db
        .select()
        .from(nexthubPispConsents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(nexthubPispConsents.createdAt))
        .limit(input?.limit ?? 25)
        .offset(input?.offset ?? 0);
    }),

  // Get a single consent by ID
  getConsent: protectedProcedure
    .input(z.object({ consentId: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db
        .select()
        .from(nexthubPispConsents)
        .where(eq(nexthubPispConsents.consentId, input.consentId))
        .limit(1);

      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Consent ${input.consentId} not found` });
      }
      return row;
    }),

  // Revoke a consent
  revokeConsent: protectedProcedure
    .input(z.object({
      consentId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [existing] = await db
        .select()
        .from(nexthubPispConsents)
        .where(eq(nexthubPispConsents.consentId, input.consentId))
        .limit(1);

      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Consent ${input.consentId} not found` });
      }

      if (existing.state === "REVOKED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Consent is already revoked" });
      }

      const [updated] = await db
        .update(nexthubPispConsents)
        .set({
          state: "REVOKED",
          revokedAt: new Date(),
          revokeReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(nexthubPispConsents.consentId, input.consentId))
        .returning();

      nexthubPublish.pispConsentRevoked({
        consentId: updated.consentId,
        pispId: updated.pispId,
        dfspId: updated.dfspId,
        state: "REVOKED",
        timestamp: new Date().toISOString(),
      }).catch(() => {});
      return updated;
    }),

  // PISP consent statistics
  stats: protectedProcedure.query(async () => {
    const all = await db.select().from(nexthubPispConsents);
    return {
      total: all.length,
      byState: Object.fromEntries(
        ["REQUESTED", "GRANTED", "ACTIVE", "REVOKED", "EXPIRED"].map((s) => [
          s,
          all.filter((r) => r.state === s).length,
        ])
      ),
      activePisps: [...new Set(all.filter((r) => r.state === "ACTIVE").map((r) => r.pispId))].length,
    };
  }),
});
