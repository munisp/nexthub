/**
 * server/routers/wave230_security.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Wave 230 — Cryptography & Security Hardening
 *
 * Exposes tRPC procedures for:
 *   - HSM key generation, rotation, and public key export
 *   - mTLS certificate issuance, listing, and revocation
 *   - JWS signature verification (test endpoint)
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  generateDfspKeyPair,
  rotateDfspKey,
  getPublicJwk,
  signPayload,
  verifySignature,
} from "../wave230/hsm";
import {
  issueDfspCertificate,
  revokeCertificate,
  getDfspCertificates,
  getCACertPem,
} from "../wave230/mtls";
import { db } from "../db";
import { jwsKeys, mtlsCertificates } from "../../drizzle/nexthub_schema";
import { eq, desc } from "drizzle-orm";

// ─── HSM / JWS router ────────────────────────────────────────────────────────

const hsmRouter = router({
  /** Generate a new RSA-PSS or EC key pair for a DFSP */
  generateKey: protectedProcedure
    .input(z.object({
      dfspId:    z.string().min(1),
      algorithm: z.enum(["RS256", "RS384", "RS512", "PS256", "ES256", "ES384"]).default("PS256"),
    }))
    .mutation(async ({ input }) => {
      return generateDfspKeyPair(input.dfspId, input.algorithm);
    }),

  /** Rotate the active key for a DFSP (old key deactivated) */
  rotateKey: protectedProcedure
    .input(z.object({ dfspId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return rotateDfspKey(input.dfspId);
    }),

  /** Get the public JWK for a DFSP (for key exchange) */
  getPublicKey: protectedProcedure
    .input(z.object({ dfspId: z.string().min(1) }))
    .query(async ({ input }) => {
      const jwk = await getPublicJwk(input.dfspId);
      if (!jwk) throw new Error(`No active key for DFSP ${input.dfspId}`);
      return { dfspId: input.dfspId, publicJwk: jwk };
    }),

  /** List all JWS keys (active and revoked) */
  listKeys: protectedProcedure
    .input(z.object({ dfspId: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db.select({
        id: jwsKeys.id,
        dfspId: jwsKeys.dfspId,
        algorithm: jwsKeys.algorithm,
        keyType: jwsKeys.keyType,
        isActive: jwsKeys.isActive,
        createdAt: jwsKeys.createdAt,
        expiresAt: jwsKeys.expiresAt,
        revokedAt: jwsKeys.revokedAt,
      }).from(jwsKeys)
        .where(input.dfspId ? eq(jwsKeys.dfspId, input.dfspId) : undefined)
        .orderBy(desc(jwsKeys.createdAt));
      return rows;
    }),

  /** Test: sign a payload and return the JWS token */
  signTest: protectedProcedure
    .input(z.object({
      dfspId:  z.string().min(1),
      payload: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const token = await signPayload(input.dfspId, input.payload);
      return { token };
    }),

  /** Test: verify a JWS token */
  verifyTest: protectedProcedure
    .input(z.object({
      dfspId: z.string().min(1),
      token:  z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      return verifySignature(input.dfspId, input.token);
    }),

  /** Dashboard stats */
  stats: protectedProcedure.query(async () => {
    const all = await db.select().from(jwsKeys);
    return {
      totalKeys:   all.length,
      activeKeys:  all.filter(k => k.isActive).length,
      revokedKeys: all.filter(k => !k.isActive).length,
      algorithms:  [...new Set(all.map(k => k.algorithm))],
      dfspsCovered: [...new Set(all.filter(k => k.isActive).map(k => k.dfspId))].length,
    };
  }),
});

// ─── mTLS router ─────────────────────────────────────────────────────────────

const mtlsRouter = router({
  /** Issue a new client certificate for a DFSP */
  issueCertificate: protectedProcedure
    .input(z.object({
      dfspId:     z.string().min(1),
      commonName: z.string().min(1),
      csrPem:     z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return issueDfspCertificate(input.dfspId, input.commonName, input.csrPem);
    }),

  /** Revoke a certificate */
  revokeCertificate: protectedProcedure
    .input(z.object({
      certId: z.string().min(1),
      reason: z.string().default("superseded"),
    }))
    .mutation(async ({ input }) => {
      await revokeCertificate(input.certId, input.reason);
      return { success: true };
    }),

  /** List certificates for a DFSP */
  listCertificates: protectedProcedure
    .input(z.object({ dfspId: z.string().optional() }))
    .query(async ({ input }) => {
      if (input.dfspId) {
        return getDfspCertificates(input.dfspId);
      }
      return db.select({
        id: mtlsCertificates.id,
        dfspId: mtlsCertificates.dfspId,
        certType: mtlsCertificates.certType,
        commonName: mtlsCertificates.commonName,
        serialNumber: mtlsCertificates.serialNumber,
        issuedAt: mtlsCertificates.issuedAt,
        expiresAt: mtlsCertificates.expiresAt,
        status: mtlsCertificates.status,
        revokedAt: mtlsCertificates.revokedAt,
        revocationReason: mtlsCertificates.revocationReason,
      }).from(mtlsCertificates).orderBy(desc(mtlsCertificates.issuedAt));
    }),

  /** Get the Hub CA certificate (PEM) for DFSP trust-store provisioning */
  getCACert: protectedProcedure.query(async () => {
    const pem = await getCACertPem();
    return { caCertPem: pem };
  }),

  /** Stats */
  stats: protectedProcedure.query(async () => {
    const all = await db.select().from(mtlsCertificates);
    return {
      total:   all.length,
      active:  all.filter(c => c.status === "ACTIVE").length,
      revoked: all.filter(c => c.status === "REVOKED").length,
      expired: all.filter(c => c.status === "EXPIRED").length,
      dfspsCovered: [...new Set(all.filter(c => c.status === "ACTIVE" && c.certType === "CLIENT").map(c => c.dfspId))].length,
    };
  }),
});

// ─── Exported router ─────────────────────────────────────────────────────────

export const wave230Router = router({
  hsm:  hsmRouter,
  mtls: mtlsRouter,
});
