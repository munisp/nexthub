/**
 * nibssNip.ts — NIBSS / NIP tRPC Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes all NIBSS payment rails as tRPC procedures:
 *
 *   nameEnquiry       — NIP account name lookup (with 24h cache)
 *   nipTransfer       — NIP instant credit transfer
 *   nipStatus         — NIP transaction status query
 *   nqrGenerate       — NQR QR code generation
 *   nqrVerify         — NQR payment verification
 *   neftBatch         — NEFT same-day batch submission
 *   rtgsTransfer      — RTGS high-value transfer (≥ ₦1M)
 *   bvnValidate       — BVN cross-validation
 *   listBanks         — Full CBN-licensed bank directory
 *   getBankByCode     — Single bank lookup by NIP code
 *   inwardWebhook     — Inward NIP credit notification (REST, not tRPC)
 */

import { z } from "zod";
import { router, protectedProcedure, hubOperatorProcedure } from "../_core/trpc";
import { db } from "../db";
import { nipNameEnquiryCache } from "../../drizzle/nexthub_schema";
import { and, eq, gte } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  nipNameEnquiry,
  nipFundTransfer,
  nipTransactionStatus,
  neftSubmitBatch,
  rtgsTransfer,
  bvnValidate,
  getAllBanks,
  getBankByNipCode,
} from "../nibss/nibssGateway";
import {
  generateNqr,
  generateStaticMerchantQr,
  getNqrStatus,
} from "../nibss/nqrService";
import { nqrTransactions } from "../../drizzle/nqr_schema";
import { desc } from "drizzle-orm";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";
import { cache, TTL } from "../cache";
import { logger } from "../logger";

export const nibssNipRouter = router({

  // ── Bank Directory ──────────────────────────────────────────────────────────
  listBanks: protectedProcedure
    .query(() => getAllBanks()),

  getBankByCode: protectedProcedure
    .input(z.object({ nipCode: z.string() }))
    .query(({ input }) => getBankByNipCode(input.nipCode)),

  // ── NIP Name Enquiry ────────────────────────────────────────────────────────
  nameEnquiry: protectedProcedure
    .input(z.object({
      destinationBankCode: z.string().length(3),
      accountNumber: z.string().length(10),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = String(ctx.user!.id);

      // Check 24h cache first
      const cached = await db.select().from(nipNameEnquiryCache)
        .where(and(
          eq(nipNameEnquiryCache.bankNipCode, input.destinationBankCode),
          eq(nipNameEnquiryCache.accountNumber, input.accountNumber),
          gte(nipNameEnquiryCache.expiresAt, new Date()),
        ))
        .limit(1);

      if (cached.length > 0) {
        logger.info("[nibss-nip] Name enquiry served from cache", { bankCode: input.destinationBankCode });
        return {
          accountName: cached[0].accountName,
          sessionId: cached[0].id,
          responseCode: "00",
          responseMessage: "Successful (cached)",
          fromCache: true,
        };
      }

      // Live NIBSS call
      const result = await nipNameEnquiry({
        destinationBankCode: input.destinationBankCode,
        accountNumber: input.accountNumber,
      });

      // Cache result for 24 hours
      if (result.responseCode === "00") {
        await db.insert(nipNameEnquiryCache).values({
          bankNipCode: input.destinationBankCode,
          accountNumber: input.accountNumber,
          accountName: result.accountName,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        }).onConflictDoNothing();
      }

      return { ...result, fromCache: false };
    }),

  // ── NIP Fund Transfer ───────────────────────────────────────────────────────
  nipTransfer: hubOperatorProcedure
    .input(z.object({
      sessionId: z.string(),
      destinationBankCode: z.string().length(3),
      destinationAccountNumber: z.string().length(10),
      destinationAccountName: z.string(),
      originatorAccountNumber: z.string().length(10),
      originatorAccountName: z.string(),
      amountKobo: z.number().int().min(100), // minimum ₦1
      narration: z.string().max(100),
      beneficiaryBvn: z.string().optional(),
      originatorBvn: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await nipFundTransfer({
        sessionId: input.sessionId,
        destinationBankCode: input.destinationBankCode,
        destinationAccountNumber: input.destinationAccountNumber,
        destinationAccountName: input.destinationAccountName,
        beneficiaryBvn: input.beneficiaryBvn,
        originatorAccountNumber: input.originatorAccountNumber,
        originatorAccountName: input.originatorAccountName,
        originatorBvn: input.originatorBvn,
        amount: input.amountKobo,
        narration: input.narration,
      });

      // Publish Kafka event for downstream reconciliation
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_COMMITTED, {
        eventType: "NIP_TRANSFER",
        sessionId: result.sessionId ?? "unknown",
        responseCode: result.responseCode,
        amountKobo: input.amountKobo,
        destinationBankCode: input.destinationBankCode,
        initiatedBy: ctx.user!.id,
        timestamp: new Date().toISOString(),
      });

      return result;
    }),

  // ── NIP Transaction Status ──────────────────────────────────────────────────
  nipStatus: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(({ input }) => nipTransactionStatus(input.sessionId)),

  // ── NQR Dynamic QR Code Generation (EMVCo TLV, local render) ─────────────────
  nqrGenerate: hubOperatorProcedure
    .input(z.object({
      merchantId:    z.string().min(1).max(50),
      merchantName:  z.string().min(1).max(25),
      bankCode:      z.string().length(3),
      accountNumber: z.string().length(10),
      amountKobo:    z.number().int().min(100).optional(),
      reference:     z.string().min(1).max(25),
      expiryMinutes: z.number().int().min(1).max(1440).default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      return generateNqr({
        merchantId:    input.merchantId,
        merchantName:  input.merchantName,
        bankCode:      input.bankCode,
        accountNumber: input.accountNumber,
        amountKobo:    input.amountKobo,
        reference:     input.reference,
        expiryMinutes: input.expiryMinutes,
        tenantId:      String(ctx.user!.id),
      });
    }),

  // ── NQR Static Merchant QR (open amount, persistent) ─────────────────────────
  nqrGenerateStatic: hubOperatorProcedure
    .input(z.object({
      merchantId:    z.string().min(1).max(50),
      merchantName:  z.string().min(1).max(25),
      bankCode:      z.string().length(3),
      accountNumber: z.string().length(10),
    }))
    .mutation(async ({ input, ctx }) => {
      return generateStaticMerchantQr({
        merchantId:    input.merchantId,
        merchantName:  input.merchantName,
        bankCode:      input.bankCode,
        accountNumber: input.accountNumber,
        tenantId:      String(ctx.user!.id),
      });
    }),

  // ── NQR Payment Status (Redis cache → DB, no NIBSS round-trip) ───────────────
  nqrStatus: protectedProcedure
    .input(z.object({ reference: z.string() }))
    .query(async ({ input }) => {
      const status = await getNqrStatus(input.reference);
      if (!status) throw new (await import("@trpc/server")).TRPCError({ code: "NOT_FOUND", message: `NQR ${input.reference} not found` });
      return status;
    }),

  // ── NQR Merchant Transaction List (cursor-paginated) ─────────────────────────
  nqrMerchantList: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      status:     z.enum(["PENDING", "PAID", "EXPIRED", "CANCELLED", "ALL"]).default("ALL"),
      limit:      z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(nqrTransactions.merchantId, input.merchantId)];
      if (input.status !== "ALL") conditions.push(eq(nqrTransactions.status, input.status));
      const rows = await db
        .select({
          id:             nqrTransactions.id,
          reference:      nqrTransactions.reference,
          amountKobo:     nqrTransactions.amountKobo,
          paidAmountKobo: nqrTransactions.paidAmountKobo,
          status:         nqrTransactions.status,
          qrType:         nqrTransactions.qrType,
          expiresAt:      nqrTransactions.expiresAt,
          createdAt:      nqrTransactions.createdAt,
        })
        .from(nqrTransactions)
        .where(and(...conditions))
        .orderBy(desc(nqrTransactions.createdAt))
        .limit(input.limit);
      return rows;
    }),

  // ── NEFT Batch Submission ───────────────────────────────────────────────────
  neftBatch: hubOperatorProcedure
    .input(z.object({
      batchRef: z.string(),
      entries: z.array(z.object({
        originatorAccountNumber: z.string().length(10),
        originatorBankCode: z.string(),
        beneficiaryAccountNumber: z.string().length(10),
        beneficiaryBankCode: z.string(),
        amountKobo: z.number().int().min(100),
        narration: z.string().max(100),
        reference: z.string(),
      })).min(1).max(1000),
    }))
    .mutation(({ input }) => neftSubmitBatch(
      input.entries.map((e) => ({ ...e, amount: e.amountKobo })),
      input.batchRef,
    )),

  // ── RTGS High-Value Transfer ────────────────────────────────────────────────
  rtgsTransfer: hubOperatorProcedure
    .input(z.object({
      originatorBankCode: z.string(),
      originatorAccountNumber: z.string().length(10),
      beneficiaryBankCode: z.string(),
      beneficiaryAccountNumber: z.string().length(10),
      amountKobo: z.number().int().min(1_000_000_00), // ₦1M minimum
      narration: z.string().max(100),
      reference: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await rtgsTransfer({
        originatorBankCode: input.originatorBankCode,
        originatorAccountNumber: input.originatorAccountNumber,
        beneficiaryBankCode: input.beneficiaryBankCode,
        beneficiaryAccountNumber: input.beneficiaryAccountNumber,
        amount: input.amountKobo,
        narration: input.narration,
        reference: input.reference,
      });

      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_COMMITTED, {
        eventType: "RTGS_TRANSFER",
        reference: input.reference,
        responseCode: result.responseCode,
        amountKobo: input.amountKobo,
        initiatedBy: ctx.user!.id,
        timestamp: new Date().toISOString(),
      });

      return result;
    }),

  // ── BVN Validation ──────────────────────────────────────────────────────────
  bvnValidate: hubOperatorProcedure
    .input(z.object({
      bvn: z.string().length(11),
      firstName: z.string(),
      lastName: z.string(),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(({ input }) => bvnValidate(input.bvn, input.firstName, input.lastName, input.dateOfBirth)),
});
