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
import { createHash, randomBytes } from "node:crypto";
import { router, protectedProcedure, hubOperatorProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";
import { db } from "../db";
import { dictAliases, identityLookups, biometricVerifications } from "../../drizzle/national_switch_schema";
import {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
  facePartners, facePartnerApiKeys, facePartnerUsageLogs,
  faceBatchIdentifyLogs, facePaymentAssertions, faceBiometricPublicKeys,
  faceActiveLivenessSessions, faceDeepfakeLogs, faceAttributeLogs,
  faceVideoVerifyLogs, faceBiasAuditSnapshots,
  ninAuthConsentSessions, ninAuthVerifiedIdentities,
  ninVerificationLogs, ninFaceMatchLogs, ninVCVerificationLogs,
} from "../../drizzle/nexthub_schema";
import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
  batchIdentifyFacesViaMiddleware, getFacePublicKeyViaMiddleware,
  startActiveLivenessViaMiddleware, verifyActiveLivenessViaMiddleware,
  detectDeepfakeViaMiddleware, getFaceAttributesViaMiddleware,
  videoVerifyViaMiddleware, getBiasReportViaMiddleware,
  ninAuthInitViaMiddleware, ninAuthCallbackViaMiddleware,
  verifyNINViaMiddleware, ninFaceMatchViaMiddleware, verifyNINVCViaMiddleware,
  type NINAuthInitResult, type NINAuthTokenResult,
  type NINVerifyResult, type NINFaceMatchResult, type NINVCVerifyResult,
} from "../middlewareBridge";
import { eq, desc, and } from "drizzle-orm";

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

  // ─── MOSIP eKYC ─────────────────────────────────────────────────────────────

  /** Generate a MOSIP OTP for identity verification */
  generateMOSIPOTP: protectedProcedure
    .input(z.object({
      individualId:     z.string().min(5).max(64),
      individualIdType: z.enum(["UIN", "VID", "NIN", "BVN"]),
      otpChannel:       z.array(z.enum(["EMAIL", "PHONE"])).min(1),
      transactionId:    z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { generateMOSIPOTPViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipOtpLog } = await import("../../drizzle/nexthub_schema");
      const result = await generateMOSIPOTPViaMiddleware({
        ...input,
        tenantId: String(ctx.user!.id),
      });
      // Persist audit log regardless of bridge result
      await db.insert(mosipOtpLog).values({
        tenantId:        String(ctx.user!.id),
        individualId:    input.individualId,
        individualIdType:input.individualIdType,
        transactionId:   input.transactionId,
        otpChannel:      input.otpChannel,
        maskedEmail:     result?.maskedEmail ?? null,
        maskedMobile:    result?.maskedMobile ?? null,
        status:          result ? "OTP_SENT" : "FAILED",
      });
      if (!result) throw new Error("MOSIP OTP service unavailable");
      return result;
    }),

  /** Submit a MOSIP IDA eKYC request and persist the verified identity data */
  submitMOSIPEKYC: protectedProcedure
    .input(z.object({
      individualId:        z.string().min(5).max(64),
      individualIdType:    z.enum(["UIN", "VID", "NIN", "BVN"]),
      otp:                 z.string().optional(),
      biometricData:       z.string().optional(),
      consentObtained:     z.boolean(),
      requestedAttributes: z.array(z.string()).min(1),
      transactionId:       z.string().uuid(),
      partnerId:           z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { submitMOSIPEKYCViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipEkycSubmissions } = await import("../../drizzle/nexthub_schema");
      const { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } = await import("../kafka/nexthubKafkaProducer");
      const result = await submitMOSIPEKYCViaMiddleware({
        ...input,
        tenantId: String(ctx.user!.id),
      });
      const [submission] = await db.insert(mosipEkycSubmissions).values({
        tenantId:            String(ctx.user!.id),
        individualId:        input.individualId,
        individualIdType:    input.individualIdType,
        transactionId:       input.transactionId,
        consentObtained:     input.consentObtained,
        requestedAttributes: input.requestedAttributes,
        kycData:             result?.kycData ?? null,
        status:              result ? "SUCCESS" : "FAILED",
        partnerId:           input.partnerId ?? null,
        responseTime:        result ? new Date() : null,
      }).returning();
      if (result) {
        await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_ONBOARDED, {
          eventType: "MOSIP_EKYC_COMPLETED",
          tenantId:  String(ctx.user!.id),
          submissionId: String(submission.id),
          individualId: input.individualId,
          timestamp: new Date().toISOString(),
        });
      }
      if (!result) throw new Error("MOSIP eKYC service unavailable");
      return { submissionId: submission.id, ...result };
    }),

  /** Initiate an eSignet OIDC4VP authorization flow */
  getESignetAuthURL: protectedProcedure
    .input(z.object({
      clientId:    z.string(),
      redirectUri: z.string().url(),
      scope:       z.string().optional(),
      acrValues:   z.string().optional(),
      state:       z.string(),
      nonce:       z.string(),
      claims:      z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getESignetAuthURLViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { esignetSessions } = await import("../../drizzle/nexthub_schema");
      const result = await getESignetAuthURLViaMiddleware(input);
      if (!result) throw new Error("eSignet service unavailable");
      await db.insert(esignetSessions).values({
        tenantId:        String(ctx.user!.id),
        clientId:        input.clientId,
        state:           input.state,
        nonce:           input.nonce,
        redirectUri:     input.redirectUri,
        scope:           input.scope ?? null,
        acrValues:       input.acrValues ?? null,
        authorizationUrl:result.authorizationUrl,
        status:          "INITIATED",
      });
      return result;
    }),

  /** Exchange an eSignet authorization code for tokens */
  exchangeESignetCode: protectedProcedure
    .input(z.object({
      code:         z.string(),
      redirectUri:  z.string().url(),
      clientId:     z.string(),
      clientSecret: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { exchangeESignetCodeViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { esignetSessions } = await import("../../drizzle/nexthub_schema");
      const { eq } = await import("drizzle-orm");
      const result = await exchangeESignetCodeViaMiddleware({
        ...input,
        tenantId: String(ctx.user!.id),
      });
      if (!result) throw new Error("eSignet token exchange failed");
      // Update the session with the token
      await db.update(esignetSessions)
        .set({
          authCode:       input.code,
          accessToken:    result.accessToken,
          idToken:        result.idToken,
          tokenExpiresAt: new Date(Date.now() + result.expiresIn * 1000),
          status:         "TOKEN_ISSUED",
          updatedAt:      new Date(),
        })
        .where(eq(esignetSessions.clientId, input.clientId));
      return result;
    }),

  /** Issue a MOSIP Verifiable Credential via eSignet OIDC4VCI */
  issueVerifiableCredential: protectedProcedure
    .input(z.object({
      accessToken:          z.string(),
      format:               z.enum(["ldp_vc", "jwt_vc_json", "mso_mdoc"]).optional(),
      credentialDefinition: z.record(z.string(), z.unknown()).optional(),
      proofJwt:             z.string(),
      individualId:         z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { issueVerifiableCredentialViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { verifiableCredentials } = await import("../../drizzle/nexthub_schema");
      const { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } = await import("../kafka/nexthubKafkaProducer");
      const result = await issueVerifiableCredentialViaMiddleware({
        ...input,
        tenantId: String(ctx.user!.id),
      });
      if (!result) throw new Error("VC issuance service unavailable");
      const [vc] = await db.insert(verifiableCredentials).values({
        tenantId:       String(ctx.user!.id),
        individualId:   input.individualId ?? "unknown",
        format:         result.format,
        credentialData: result.credential as Record<string, unknown>,
        cNonce:         result.cNonce ?? null,
        status:         "ACTIVE",
      }).returning();
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.PARTICIPANT_ONBOARDED, {
        eventType:    "VC_ISSUED",
        tenantId:     String(ctx.user!.id),
        vcId:         String(vc.id),
        format:       result.format,
        timestamp:    new Date().toISOString(),
      });
      return { vcId: vc.id, ...result };
    }),
  // ─── MOSIP Citizen Registration Pipeline ─────────────────────────────────────

  /** Stage 1: Create a MOSIP pre-registration application and obtain an AID */
  createPreRegistration: protectedProcedure
    .input(z.object({
      demographicDetails: z.object({
        identity: z.object({
          IDSchemaVersion:  z.number(),
          fullName:         z.array(z.object({ language: z.string(), value: z.string() })),
          dateOfBirth:      z.string(),
          gender:           z.array(z.object({ language: z.string(), value: z.string() })),
          residenceStatus:  z.array(z.object({ language: z.string(), value: z.string() })),
          addressLine1:     z.array(z.object({ language: z.string(), value: z.string() })),
          region:           z.array(z.object({ language: z.string(), value: z.string() })),
          province:         z.array(z.object({ language: z.string(), value: z.string() })),
          city:             z.array(z.object({ language: z.string(), value: z.string() })),
          zone:             z.array(z.object({ language: z.string(), value: z.string() })),
          postalCode:       z.string(),
          phone:            z.string(),
          email:            z.string().email(),
        }),
      }),
      langCode:   z.string().default("eng"),
      createdBy:  z.string(),
      authToken:  z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { createPreRegistrationViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipRegistrations } = await import("../../drizzle/nexthub_schema");
      const result = await createPreRegistrationViaMiddleware(input);
      if (!result) throw new Error("MOSIP pre-registration service unavailable");
      const identity = input.demographicDetails.identity;
      await db.insert(mosipRegistrations).values({
        tenantId:          String(ctx.user!.id),
        preRegistrationId: result.preRegistrationId,
        createdBy:         input.createdBy,
        langCode:          input.langCode,
        statusCode:        result.statusCode,
        fullName:          identity.fullName[0]?.value ?? null,
        dateOfBirth:       identity.dateOfBirth,
        gender:            identity.gender[0]?.value ?? null,
        email:             identity.email,
        phone:             identity.phone,
        postalCode:        identity.postalCode,
      }).onConflictDoNothing();
      return result;
    }),

  /** Get a pre-registration application by AID */
  getPreRegistration: protectedProcedure
    .input(z.object({ aid: z.string(), authToken: z.string() }))
    .query(async ({ input }) => {
      const { getPreRegistrationViaMiddleware } = await import("../middlewareBridge");
      const result = await getPreRegistrationViaMiddleware(input.aid, input.authToken);
      if (!result) throw new Error("Pre-registration not found");
      return result;
    }),

  /** Book a registration center appointment for a pre-registration application */
  bookAppointment: protectedProcedure
    .input(z.object({
      preRegistrationId:    z.string(),
      registrationCenterId: z.string(),
      slotFromTime:         z.string(),
      slotToTime:           z.string(),
      appointmentDate:      z.string(),
      authToken:            z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { bookAppointmentViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipRegistrations } = await import("../../drizzle/nexthub_schema");
      const { eq } = await import("drizzle-orm");
      const result = await bookAppointmentViaMiddleware(input);
      if (!result) throw new Error("Appointment booking failed");
      await db.update(mosipRegistrations)
        .set({
          statusCode:      "APPOINTMENT_BOOKED",
          appointmentDate: input.appointmentDate,
          centerId:        input.registrationCenterId,
          updatedAt:       new Date(),
        })
        .where(eq(mosipRegistrations.preRegistrationId, input.preRegistrationId));
      return result;
    }),

  /** Cancel a registration appointment */
  cancelAppointment: protectedProcedure
    .input(z.object({ aid: z.string(), authToken: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { cancelAppointmentViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipRegistrations } = await import("../../drizzle/nexthub_schema");
      const { eq } = await import("drizzle-orm");
      const result = await cancelAppointmentViaMiddleware(input.aid, input.authToken);
      if (!result) throw new Error("Appointment cancellation failed");
      await db.update(mosipRegistrations)
        .set({ statusCode: "APPOINTMENT_CANCELLED", updatedAt: new Date() })
        .where(eq(mosipRegistrations.preRegistrationId, input.aid));
      return result;
    }),

  /** Stage 2: Upload an encrypted registration packet to the Registration Processor */
  uploadPacket: protectedProcedure
    .input(z.object({
      packetId:          z.string(),
      packetName:        z.string(),
      packetContent:     z.string(),
      source:            z.string().optional(),
      process:           z.enum(["NEW", "UPDATE", "LOST"]).optional(),
      schemaVersion:     z.string().optional(),
      schemaHash:        z.string().optional(),
      supervisorStatus:  z.string().optional(),
      supervisorComment: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { uploadPacketViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipRegistrationPackets } = await import("../../drizzle/nexthub_schema");
      const result = await uploadPacketViaMiddleware(input);
      if (!result) throw new Error("Packet upload failed");
      await db.insert(mosipRegistrationPackets).values({
        tenantId:       String(ctx.user!.id),
        registrationId: result.registrationId,
        packetId:       input.packetId,
        packetName:     input.packetName,
        source:         input.source ?? "NEXTHUB",
        process:        input.process ?? "NEW",
        schemaVersion:  input.schemaVersion ?? null,
        statusCode:     "RECEIVED",
      }).onConflictDoNothing();
      return result;
    }),

  /** Check the processing status of a registration packet by RID */
  getPacketStatus: protectedProcedure
    .input(z.object({ rid: z.string() }))
    .query(async ({ input }) => {
      const { getPacketStatusViaMiddleware } = await import("../middlewareBridge");
      const result = await getPacketStatusViaMiddleware(input.rid);
      if (!result) throw new Error("Packet status unavailable");
      return result;
    }),

  /** Stage 3: Fetch the identity data for a UIN from the ID repository */
  getUINStatus: protectedProcedure
    .input(z.object({ uin: z.string(), authToken: z.string() }))
    .query(async ({ input }) => {
      const { getUINStatusViaMiddleware } = await import("../middlewareBridge");
      const result = await getUINStatusViaMiddleware(input.uin, input.authToken);
      if (!result) throw new Error("UIN not found");
      return result;
    }),

  /** Update the identity data for a UIN */
  updateUIN: protectedProcedure
    .input(z.object({
      uin:            z.string(),
      registrationId: z.string(),
      identity:       z.record(z.string(), z.unknown()),
      documents:      z.array(z.object({ category: z.string(), value: z.string() })).optional(),
      biometrics:     z.array(z.object({ type: z.string(), value: z.string() })).optional(),
      authToken:      z.string(),
    }))
    .mutation(async ({ input }) => {
      const { updateUINViaMiddleware } = await import("../middlewareBridge");
      const result = await updateUINViaMiddleware(input);
      if (!result) throw new Error("UIN update failed");
      return result;
    }),

  /** Lock specific authentication types for a UIN */
  lockUIN: protectedProcedure
    .input(z.object({
      uinHash:   z.string(),
      saltValue: z.string(),
      authType:  z.enum(["bio", "otp", "demo"]),
      authToken: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { lockUINViaMiddleware } = await import("../middlewareBridge");
      const result = await lockUINViaMiddleware(input);
      if (!result) throw new Error("UIN lock failed");
      return result;
    }),

  /** Unlock specific authentication types for a UIN */
  unlockUIN: protectedProcedure
    .input(z.object({
      uinHash:   z.string(),
      saltValue: z.string(),
      authType:  z.enum(["bio", "otp", "demo"]),
      authToken: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { unlockUINViaMiddleware } = await import("../middlewareBridge");
      const result = await unlockUINViaMiddleware(input);
      if (!result) throw new Error("UIN unlock failed");
      return result;
    }),

  /** Stage 4: Generate a Virtual ID (VID) for a UIN */
  generateVID: protectedProcedure
    .input(z.object({
      uin:       z.string(),
      vidType:   z.enum(["PERPETUAL", "TEMPORARY"]).optional(),
      authToken: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { generateVIDViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipVidRecords } = await import("../../drizzle/nexthub_schema");
      const { createHash } = await import("crypto");
      const result = await generateVIDViaMiddleware(input);
      if (!result) throw new Error("VID generation failed");
      const vidHash = createHash("sha256").update(result.vid).digest("hex");
      const uinHash = createHash("sha256").update(input.uin).digest("hex");
      await db.insert(mosipVidRecords).values({
        tenantId:    String(ctx.user!.id),
        vidHash,
        uinHash,
        vidType:     result.vidType,
        status:      "ACTIVE",
        expiryTime:  result.expiryTime ? new Date(result.expiryTime) : null,
        generatedOn: new Date(result.generatedOn),
      }).onConflictDoNothing();
      return result;
    }),

  /** Stage 5: Request generation of a national ID credential (PDF card, QR code, or VC) */
  requestIDCard: protectedProcedure
    .input(z.object({
      credentialType:  z.enum(["pdf", "qrcode", "euin", "vercred"]).optional(),
      issuer:          z.string().optional(),
      recepientId:     z.string(),
      recepientIdType: z.enum(["UIN", "VID"]).optional(),
      shareable:       z.boolean().optional(),
      additionalData:  z.record(z.string(), z.string()).optional(),
      authToken:       z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { requestIDCardViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipCredentialRequests } = await import("../../drizzle/nexthub_schema");
      const result = await requestIDCardViaMiddleware(input);
      if (!result) throw new Error("Credential issuance request failed");
      await db.insert(mosipCredentialRequests).values({
        tenantId:        String(ctx.user!.id),
        requestId:       result.requestId,
        credentialType:  input.credentialType ?? "pdf",
        issuer:          input.issuer ?? null,
        recepientId:     input.recepientId,
        recepientIdType: input.recepientIdType ?? "UIN",
        status:          "REQUESTED",
      }).onConflictDoNothing();
      return result;
    }),

  /** Check the status of a credential generation request */
  getCredentialStatus: protectedProcedure
    .input(z.object({ requestId: z.string(), authToken: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getCredentialStatusViaMiddleware } = await import("../middlewareBridge");
      const { db } = await import("../db");
      const { mosipCredentialRequests } = await import("../../drizzle/nexthub_schema");
      const { eq } = await import("drizzle-orm");
      const result = await getCredentialStatusViaMiddleware(input.requestId, input.authToken);
      if (!result) throw new Error("Credential status unavailable");
      if (result.status === "ISSUED") {
        await db.update(mosipCredentialRequests)
          .set({
            status:       "ISSUED",
            dataShareUrl: result.dataShareUrl ?? null,
            issuedAt:     new Date(),
            updatedAt:    new Date(),
          })
          .where(eq(mosipCredentialRequests.requestId, input.requestId));
      }
      return result;
    }),

  // ─── Face Biometric ────────────────────────────────────────────────────────

  /** 1:1 face verification using ArcFace cosine similarity + optional liveness */
  faceVerify: protectedProcedure
    .input(z.object({
      probe_image_b64:     z.string().min(100),
      reference_image_b64: z.string().min(100),
      subject_id:          z.string().optional(),
      require_liveness:    z.boolean().default(true),
      require_quality:     z.boolean().default(true),
      min_quality_score:   z.number().min(0).max(1).default(0.50),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceVerifyLogs).values({
        subjectId:      input.subject_id ?? null,
        verified:       result.verified,
        similarity:     result.similarity,
        distance:       result.distance,
        threshold:      result.threshold,
        livenessPassed: result.liveness_passed ?? null,
        livenessScore:  result.liveness_score ?? null,
        qualityPassed:  result.quality_passed ?? null,
        qualityScore:   result.quality_metrics?.overall_score ?? null,
        faceCountProbe: result.face_count_probe,
        faceCountRef:   result.face_count_ref,
        imageHashProbe: result.image_hash_probe,
        processingMs:   result.processing_ms,
        cached:         result.cached,
      });
      return result;
    }),

  /** Passive liveness / anti-spoofing detection (Silent-Face ONNX model) */
  faceLiveness: protectedProcedure
    .input(z.object({
      image_b64:  z.string().min(100),
      subject_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await checkFaceLivenessViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceLivenessLogs).values({
        subjectId:     input.subject_id ?? null,
        isLive:        result.is_live,
        spoofScore:    result.spoof_score,
        livenessScore: result.liveness_score,
        attackType:    result.attack_type ?? null,
        faceDetected:  result.face_detected,
        imageHash:     result.image_hash,
        processingMs:  result.processing_ms,
        cached:        result.cached,
      });
      return result;
    }),

  /** ISO 19794-5 face quality assessment */
  faceQuality: protectedProcedure
    .input(z.object({
      image_b64:  z.string().min(100),
      subject_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await assessFaceQualityViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      return result;
    }),

  /** Enroll a face embedding for a subject (stores 512-d ArcFace vector in Redis) */
  faceEnroll: hubOperatorProcedure
    .input(z.object({
      image_b64:        z.string().min(100),
      subject_id:       z.string().min(1),
      require_liveness: z.boolean().default(true),
      require_quality:  z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const result = await enrollFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      if (result.enrolled) {
        await db.insert(faceEnrollments)
          .values({
            subjectId:      result.subject_id,
            embeddingDim:   result.embedding_dim,
            livenessPassed: result.liveness_passed ?? null,
            qualityPassed:  result.quality_passed ?? null,
            isActive:       true,
          })
          .onConflictDoUpdate({
            target: faceEnrollments.subjectId,
            set: {
              embeddingDim:   result.embedding_dim,
              livenessPassed: result.liveness_passed ?? null,
              qualityPassed:  result.quality_passed ?? null,
              isActive:       true,
              updatedAt:      new Date(),
            },
          });
      }
      return result;
    }),

  /** 1:N face identification against a set of enrolled subjects */
  faceIdentify: protectedProcedure
    .input(z.object({
      probe_image_b64:  z.string().min(100),
      candidate_ids:    z.array(z.string()).min(1).max(1000),
      require_liveness: z.boolean().default(true),
      top_k:            z.number().int().min(1).max(20).default(5),
    }))
    .mutation(async ({ input }) => {
      const result = await identifyFaceViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      await db.insert(faceIdentifyLogs).values({
        identified:     result.identified,
        topMatchId:     result.top_match_id ?? null,
        topSimilarity:  result.top_similarity,
        candidateCount: input.candidate_ids.length,
        probeLiveness:  result.probe_liveness ?? null,
        processingMs:   result.processing_ms,
      });
      return result;
    }),

  /** Jaro-Winkler name match score (replaces old substring heuristic) */
  nameMatch: protectedProcedure
    .input(z.object({
      expected_first: z.string().optional(),
      expected_last:  z.string().optional(),
      actual_first:   z.string().optional(),
      actual_last:    z.string().optional(),
      expected_full:  z.string().optional(),
      actual_full:    z.string().optional(),
    }))
    .query(async ({ input }) => {
      const result = await matchNameViaMiddleware(input);
      if (!result) throw new Error("Face biometric service unavailable");
      return result;
    }),

  // ── Partner API Management ─────────────────────────────────────────────────
  createPartner: hubOperatorProcedure
    .input(z.object({
      name:          z.string().min(2),
      orgType:       z.enum(["commercial", "government", "ngo"]).default("commercial"),
      contactEmail:  z.string().email(),
      website:       z.string().url().optional(),
      allowedScopes: z.array(z.string()).default(["face:verify","face:liveness","face:quality"]),
    }))
    .mutation(async ({ input }) => {
      const id = crypto.randomUUID();
      await db.insert(facePartners).values({
        id,
        name:          input.name,
        orgType:       input.orgType,
        contactEmail:  input.contactEmail,
        website:       input.website ?? null,
        status:        "active",
        allowedScopes: JSON.stringify(input.allowedScopes),
      });
      return { id, ...input, status: "active" };
    }),

  listPartners: hubOperatorProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db.select().from(facePartners)
        .orderBy(desc(facePartners.createdAt));
      return input.status
        ? rows.filter(r => r.status === input.status)
        : rows;
    }),

  suspendPartner: hubOperatorProcedure
    .input(z.object({ partnerId: z.string() }))
    .mutation(async ({ input }) => {
      await db.update(facePartners)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(facePartners.id, input.partnerId));
      return { success: true };
    }),

  createApiKey: hubOperatorProcedure
    .input(z.object({
      partnerId:    z.string(),
      name:         z.string().min(2),
      scopes:       z.array(z.string()).default(["face:verify","face:liveness"]),
      rateLimitRpm: z.number().int().min(0).default(60),
      environment:  z.enum(["production","sandbox"]).default("production"),
      expiresAt:    z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const rawKey   = "nhfb_" + randomBytes(16).toString("hex");
      const keyHash  = createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 10);
      const id = crypto.randomUUID();
      await db.insert(facePartnerApiKeys).values({
        id,
        partnerId:    input.partnerId,
        name:         input.name,
        keyPrefix,
        keyHash,
        scopes:       JSON.stringify(input.scopes),
        rateLimitRpm: input.rateLimitRpm,
        environment:  input.environment,
        isActive:     true,
        expiresAt:    input.expiresAt ? new Date(input.expiresAt) : null,
      });
      // rawKey is returned ONCE — never stored in plaintext
      return { id, keyPrefix, rawKey, scopes: input.scopes, environment: input.environment };
    }),

  listApiKeys: hubOperatorProcedure
    .input(z.object({ partnerId: z.string() }))
    .query(async ({ input }) => {
      return db.select({
        id:           facePartnerApiKeys.id,
        name:         facePartnerApiKeys.name,
        keyPrefix:    facePartnerApiKeys.keyPrefix,
        scopes:       facePartnerApiKeys.scopes,
        rateLimitRpm: facePartnerApiKeys.rateLimitRpm,
        environment:  facePartnerApiKeys.environment,
        isActive:     facePartnerApiKeys.isActive,
        lastUsedAt:   facePartnerApiKeys.lastUsedAt,
        expiresAt:    facePartnerApiKeys.expiresAt,
        createdAt:    facePartnerApiKeys.createdAt,
      }).from(facePartnerApiKeys)
        .where(eq(facePartnerApiKeys.partnerId, input.partnerId))
        .orderBy(desc(facePartnerApiKeys.createdAt));
    }),

  revokeApiKey: hubOperatorProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ input }) => {
      await db.update(facePartnerApiKeys)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(facePartnerApiKeys.id, input.keyId));
      return { success: true };
    }),

  partnerUsageSummary: hubOperatorProcedure
    .input(z.object({
      partnerId: z.string(),
      limit:     z.number().int().min(1).max(500).default(100),
    }))
    .query(async ({ input }) => {
      return db.select().from(facePartnerUsageLogs)
        .where(eq(facePartnerUsageLogs.partnerId, input.partnerId))
        .orderBy(desc(facePartnerUsageLogs.createdAt))
        .limit(input.limit);
    }),

  // ── Batch 1:N Face Identification ─────────────────────────────────────────
  faceBatchIdentify: protectedProcedure
    .input(z.object({
      probes: z.array(z.object({
        probe_image_b64: z.string(),
        tenant_id:       z.string().optional(),
        require_liveness: z.boolean().optional(),
        top_k:           z.number().int().min(1).max(50).optional(),
        score_threshold: z.number().min(0).max(1).optional(),
      })).min(1).max(100),
      tenant_id: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await batchIdentifyFacesViaMiddleware({
        probes:    input.probes,
        tenant_id: input.tenant_id,
      });
      if (!result) throw new Error("face-biometric service unavailable");
      const logId = randomBytes(16).toString("hex");
      await db.insert(faceBatchIdentifyLogs).values({
        id:              logId,
        partnerId:       null,
        tenantId:        input.tenant_id ?? null,
        totalProbes:     result.total_probes,
        identifiedCount: result.identified_count,
        processingMs:    result.processing_ms,
        requestId:       logId,
        ipAddress:       null,
      }).onConflictDoNothing();
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.FACE_BATCH_IDENTIFY_RESULT, result, logId);
      return result;
    }),

  // ── RS256 Public Key (for verifying signed payment assertions) ─────────────
  faceGetPublicKey: hubOperatorProcedure
    .query(async () => {
      // Check cache first
      const cached = await db.select()
        .from(faceBiometricPublicKeys)
        .where(eq(faceBiometricPublicKeys.isActive, true))
        .orderBy(desc(faceBiometricPublicKeys.fetchedAt))
        .limit(1);
      if (cached.length > 0) {
        return { public_key: cached[0].publicKey, algorithm: cached[0].algorithm };
      }
      const result = await getFacePublicKeyViaMiddleware();
      if (!result) throw new Error("face-biometric service unavailable");
      // Cache the key
      const fingerprint = createHash("sha256").update(result.public_key).digest("hex");
      await db.insert(faceBiometricPublicKeys).values({
        id:          randomBytes(16).toString("hex"),
        algorithm:   result.algorithm,
        publicKey:   result.public_key,
        fingerprint: fingerprint,
        isActive:    true,
      }).onConflictDoNothing();
      return result;
    }),

  // ── Signed Payment Assertion Lookup ────────────────────────────────────────
  faceGetPaymentAssertions: hubOperatorProcedure
    .input(z.object({
      subjectId: z.string(),
      limit:     z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      return db.select().from(facePaymentAssertions)
        .where(eq(facePaymentAssertions.subjectId, input.subjectId))
        .orderBy(desc(facePaymentAssertions.issuedAt))
        .limit(input.limit);
    }),

  // ── Revoke Payment Assertion ───────────────────────────────────────────────
  faceRevokePaymentAssertion: hubOperatorProcedure
    .input(z.object({
      assertionId: z.string(),
      reason:      z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.update(facePaymentAssertions)
        .set({ revoked: true, revokedReason: input.reason ?? "manual_revocation" })
        .where(eq(facePaymentAssertions.id, input.assertionId));
      return { success: true };
    }),


  // ─── SOTA: Active Liveness ─────────────────────────────────────────────────

  startActiveLiveness: protectedProcedure
    .input(z.object({
      challenge_types: z.array(z.string()).optional(),
      tenant_id:       z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await startActiveLivenessViaMiddleware(input.challenge_types, input.tenant_id);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Active liveness service unavailable" });
      return result;
    }),

  verifyActiveLiveness: protectedProcedure
    .input(z.object({
      session_id:  z.string(),
      frames_b64:  z.array(z.string()),
      tenant_id:   z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyActiveLivenessViaMiddleware(input.session_id, input.frames_b64, input.tenant_id);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Active liveness verification failed" });
      await db.insert(faceActiveLivenessSessions).values({
        sessionId:      input.session_id,
        challengeType:  result.challenge_type,
        nonce:          input.session_id,
        tenantId:       input.tenant_id ?? null,
        passed:         result.passed,
        confidence:     result.confidence,
        framesAnalyzed: result.frames_analyzed,
        failureReason:  result.failure_reason ?? null,
        expiresAt:      new Date(Date.now() + 5 * 60 * 1000),
        verifiedAt:     new Date(),
      }).onConflictDoUpdate({ target: faceActiveLivenessSessions.sessionId, set: {
        passed: result.passed, confidence: result.confidence,
        framesAnalyzed: result.frames_analyzed, verifiedAt: new Date(),
      }});
      return result;
    }),

  // ─── SOTA: Deepfake Detection ───────────────────────────────────────────────

  detectDeepfake: protectedProcedure
    .input(z.object({
      image_b64: z.string(),
      tenant_id: z.string().optional(),
      context:   z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await detectDeepfakeViaMiddleware(input.image_b64, input.tenant_id, input.context);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Deepfake detection service unavailable" });
      const requestId = crypto.randomUUID();
      await db.insert(faceDeepfakeLogs).values({
        requestId,
        tenantId:         input.tenant_id ?? null,
        isDeepfake:       result.is_deepfake,
        deepfakeScore:    result.deepfake_score,
        attackType:       result.attack_type ?? null,
        dctArtifactScore: result.dct_artifact_score,
        consistencyScore: result.consistency_score,
        confidence:       result.confidence,
        context:          input.context ?? null,
      });
      return result;
    }),

  // ─── SOTA: Face Attributes ──────────────────────────────────────────────────

  getFaceAttributes: protectedProcedure
    .input(z.object({
      image_b64: z.string(),
      actions:   z.array(z.string()).optional(),
      tenant_id: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await getFaceAttributesViaMiddleware(input.image_b64, input.actions, input.tenant_id);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Face attributes service unavailable" });
      const requestId = crypto.randomUUID();
      await db.insert(faceAttributeLogs).values({
        requestId,
        tenantId:         input.tenant_id ?? null,
        ageEstimate:      result.age_estimate ?? null,
        ageBracket:       result.age_bracket ?? null,
        gender:           result.gender ?? null,
        genderConfidence: result.gender_confidence ?? null,
        emotion:          result.emotion ?? null,
        poseYaw:          result.pose_yaw,
        posePitch:        result.pose_pitch,
        poseRoll:         result.pose_roll,
        occlusionRegions: result.occlusion_regions ?? null,
      });
      return result;
    }),

  // ─── SOTA: Video Verification ───────────────────────────────────────────────

  videoVerify: protectedProcedure
    .input(z.object({
      frames_b64:         z.array(z.string()),
      reference_image_b64: z.string(),
      subject_id:         z.string().optional(),
      require_liveness:   z.boolean().optional(),
      context:            z.string().optional(),
      tenant_id:          z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await videoVerifyViaMiddleware(
        input.frames_b64, input.reference_image_b64,
        input.subject_id, input.require_liveness, input.context
      );
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Video verification service unavailable" });
      const requestId = crypto.randomUUID();
      await db.insert(faceVideoVerifyLogs).values({
        requestId,
        subjectId:           input.subject_id ?? null,
        tenantId:            input.tenant_id ?? null,
        verified:            result.verified,
        meanSimilarity:      result.mean_similarity,
        minSimilarity:       result.min_similarity,
        maxSimilarity:       result.max_similarity,
        framesAnalyzed:      result.frames_analyzed,
        framesPassed:        result.frames_passed,
        temporalConsistency: result.temporal_consistency,
        livenessPassed:      result.liveness_passed ?? null,
        processingMs:        result.processing_ms,
        context:             input.context ?? null,
      });
      return result;
    }),

  // ─── SOTA: Bias Audit ───────────────────────────────────────────────────────

  getBiasReport: protectedProcedure
    .query(async () => {
      const result = await getBiasReportViaMiddleware();
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "Bias audit service unavailable" });
      const snapshotId = crypto.randomUUID();
      await db.insert(faceBiasAuditSnapshots).values({
        snapshotId,
        generatedAt:     new Date(result.generated_at),
        windowSecs:      result.window_secs,
        totalOperations: result.total_operations,
        groups:          result.groups,
        alerts:          result.alerts,
        summary:         result.summary,
      });
      return result;
    }),

  // ─── NINAuth / NIMC Integration Procedures ─────────────────────────────────

  /**
   * Flow 1a: Generate NINAuth OIDC authorization URL with PKCE.
   * The citizen is redirected to this URL to consent on the NINAuth mobile app.
   */
  ninAuthInit: protectedProcedure
    .input(z.object({
      scopes:   z.array(z.string()).optional().default(["openid", "profile", "nin"]),
      nonce:    z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const state        = randomBytes(32).toString("hex");
      const codeVerifier = randomBytes(64).toString("base64url");
      const sessionId    = crypto.randomUUID();

      // Persist session for CSRF and PKCE validation
      await db.insert(ninAuthConsentSessions).values({
        id:           sessionId,
        state,
        codeVerifier,
        nonce:        input.nonce,
        scopes:       input.scopes,
        status:       "pending",
        expiresAt:    new Date(Date.now() + 10 * 60 * 1000), // 10 min
      });

      const result = await ninAuthInitViaMiddleware(state, codeVerifier, input.scopes, input.nonce);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NINAuth service unavailable" });

      return { sessionId, state, authorizationUrl: result.authorization_url };
    }),

  /**
   * Flow 1b: Exchange NINAuth authorization code for tokens and store verified claims.
   */
  ninAuthCallback: protectedProcedure
    .input(z.object({
      code:  z.string(),
      state: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Look up the pending session
      const [session] = await db
        .select()
        .from(ninAuthConsentSessions)
        .where(and(
          eq(ninAuthConsentSessions.state, input.state),
          eq(ninAuthConsentSessions.status, "pending"),
        ))
        .limit(1);

      if (!session) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired NINAuth state" });

      const result = await ninAuthCallbackViaMiddleware(input.code, session.codeVerifier, input.state);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NINAuth token exchange failed" });

      const claims = result.nin_claims as Record<string, string>;
      const ninHash = createHash("sha256").update(String(claims.sub ?? "")).digest("hex");

      // Store verified identity (zero-knowledge: NIN is hashed)
      const identityId = crypto.randomUUID();
      await db.insert(ninAuthVerifiedIdentities).values({
        id:          identityId,
        ninHash,
        firstName:   claims.given_name,
        lastName:    claims.family_name,
        middleName:  claims.middle_name,
        dateOfBirth: claims.birthdate,
        gender:      claims.gender,
        phoneHash:   claims.phone_number ? createHash("sha256").update(claims.phone_number).digest("hex") : undefined,
        emailHash:   claims.email ? createHash("sha256").update(claims.email).digest("hex") : undefined,
        accessToken: result.access_token,
        idToken:     result.id_token,
        tokenExpiresAt: new Date(Date.now() + result.expires_in * 1000),
        userId:      String(ctx.user?.id ?? ""),
        sessionId:   session.id,
      });

      // Mark session completed
      await db.update(ninAuthConsentSessions)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(ninAuthConsentSessions.id, session.id));

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_CONSENT,
        { event: "NINAUTH_CONSENT_GRANTED", ninHash, identityId },
        identityId,
      );

      return { identityId, ninHash, verified: true };
    }),

  /**
   * Flow 2: Direct NIN verification (operator KYC).
   * Submits NIN + name to NIMC and receives field-level match results.
   */
  verifyNIN: hubOperatorProcedure
    .input(z.object({
      nin:         z.string().length(11),
      firstName:   z.string(),
      lastName:    z.string(),
      dateOfBirth: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyNINViaMiddleware(
        input.nin, input.firstName, input.lastName, input.dateOfBirth
      );
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NIN verification service unavailable" });

      const logId = crypto.randomUUID();
      const ninPrefix = input.nin.slice(0, 4) + "*******";
      await db.insert(ninVerificationLogs).values({
        id:           logId,
        ninPrefix,
        verified:     result.verified,
        matchType:    result.match_type,
        fieldResults: result.field_results,
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_KYC,
        { event: "NIN_KYC_VERIFIED", ninPrefix, verified: result.verified, matchType: result.match_type },
        logId,
      );

      return result;
    }),

  /**
   * Flow 3: Face + NIN biometric match.
   * Fetches the NIN-enrolled photo from NIMC and runs ArcFace 1:1 + liveness.
   */
  ninFaceMatch: protectedProcedure
    .input(z.object({
      nin:          z.string().length(11),
      liveImageB64: z.string().min(100),
      context:      z.enum(["government", "payment", "border", "event"]).default("government"),
      accessToken:  z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await ninFaceMatchViaMiddleware(
        input.nin, input.liveImageB64, input.context, input.accessToken
      );
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "NIN face match service unavailable" });

      const logId = crypto.randomUUID();
      const ninPrefix = input.nin.slice(0, 4) + "*******";
      await db.insert(ninFaceMatchLogs).values({
        id:             logId,
        ninPrefix,
        verified:       result.verified,
        similarity:     result.similarity,
        livenessPassed: result.liveness_passed,
        livenessScore:  result.liveness_score,
        matchType:      result.match_type,
        context:        input.context,
        assertionJwtId: result.assertion_jwt ? createHash("sha256").update(result.assertion_jwt).digest("hex").slice(0, 16) : undefined,
        userId:         String(ctx.user?.id ?? ""),
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_FACE_MATCH,
        { event: "NINAUTH_FACE_MATCH", ninPrefix, verified: result.verified, context: input.context },
        logId,
      );

      return result;
    }),

  /**
   * Flow 4: Verify a W3C Verifiable Credential JWT issued by NINAuth.
   */
  verifyNINVC: protectedProcedure
    .input(z.object({
      vcJwt: z.string().min(50),
    }))
    .mutation(async ({ input }) => {
      const result = await verifyNINVCViaMiddleware(input.vcJwt);
      if (!result) throw new TRPCError({ code: "BAD_GATEWAY", message: "VC verification service unavailable" });

      const logId = crypto.randomUUID();
      const subjectNinHash = result.subject_nin
        ? createHash("sha256").update(result.subject_nin).digest("hex")
        : undefined;

      await db.insert(ninVCVerificationLogs).values({
        id:             logId,
        vcId:           input.vcJwt.slice(0, 32),
        issuer:         result.issuer,
        subjectNinHash,
        valid:          result.valid,
        claims:         result.claims,
        error:          result.error,
      });

      await publishKafkaEvent(
        NEXTHUB_KAFKA_TOPICS.NINAUTH_VC_VERIFIED,
        { event: "NINAUTH_VC_VERIFIED", valid: result.valid, issuer: result.issuer },
        logId,
      );

      return result;
    }),

  /** List NINAuth consent sessions for the current user. */
  listNINAuthSessions: protectedProcedure
    .query(async ({ ctx }) => {
      return db
        .select()
        .from(ninAuthConsentSessions)
        .where(eq(ninAuthConsentSessions.userId, String(ctx.user?.id ?? "")))
        .orderBy(desc(ninAuthConsentSessions.createdAt))
        .limit(20);
    }),

  /** List NIN face-match logs (Hub Operator only). */
  listNINFaceMatchLogs: hubOperatorProcedure
    .input(z.object({
      context:  z.string().optional(),
      limit:    z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const q = db.select().from(ninFaceMatchLogs).orderBy(desc(ninFaceMatchLogs.requestedAt)).limit(input.limit);
      return q;
    }),

});
