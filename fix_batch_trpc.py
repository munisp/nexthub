#!/usr/bin/env python3
"""Append batch-identify and public-key tRPC procedures to nexthubIdentityDirectory.ts"""

path = "/home/ubuntu/nexthub/server/routers/nexthubIdentityDirectory.ts"
content = open(path).read()

# 1. Add new schema imports
old_imports = """import {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
  facePartners, facePartnerApiKeys, facePartnerUsageLogs,
} from "../../drizzle/nexthub_schema";"""

new_imports = """import {
  faceVerifyLogs, faceLivenessLogs, faceEnrollments, faceIdentifyLogs,
  facePartners, facePartnerApiKeys, facePartnerUsageLogs,
  faceBatchIdentifyLogs, facePaymentAssertions, faceBiometricPublicKeys,
} from "../../drizzle/nexthub_schema";"""

content = content.replace(old_imports, new_imports)

# 2. Add new bridge function imports
old_bridge = """import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
} from "../middlewareBridge";"""

new_bridge = """import {
  verifyFaceViaMiddleware, checkFaceLivenessViaMiddleware,
  assessFaceQualityViaMiddleware, enrollFaceViaMiddleware,
  identifyFaceViaMiddleware, matchNameViaMiddleware,
  batchIdentifyFacesViaMiddleware, getFacePublicKeyViaMiddleware,
} from "../middlewareBridge";"""

content = content.replace(old_bridge, new_bridge)

# 3. Append new procedures before the last closing brace/paren
# The file ends with:   }),\n (no closing brace for the router)
# We need to append before the very last line

new_procedures = """
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
      await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.FACE_BATCH_IDENTIFY_RESULT, logId, result);
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
"""

# Append before the last line (which is just "});")
lines = content.rstrip().split('\n')
# Find the closing of the router export
last_line = lines[-1].strip()
if last_line in ('});', '});'):
    lines.insert(-1, new_procedures)
    content = '\n'.join(lines) + '\n'
else:
    # Just append
    content = content.rstrip() + '\n' + new_procedures + '\n'

open(path, 'w').write(content)
print("nexthubIdentityDirectory.ts updated successfully")
