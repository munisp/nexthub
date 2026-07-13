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
import { db } from "../db";
import { dictAliases, identityLookups, biometricVerifications } from "../../drizzle/national_switch_schema";
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

});
