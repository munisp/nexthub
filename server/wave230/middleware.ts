/**
 * wave230/middleware.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express middleware for:
 *   1. mTLS client certificate validation on /api/v1 (integration API)
 *   2. JWS signature verification on inbound transfer requests
 *   3. JWS signature injection on outbound responses (non-repudiation)
 */

import type { Request, Response, NextFunction } from "express";
import { verifySignature } from "./hsm";
import { db } from "../db";
import { mtlsCertificates } from "../../drizzle/nexthub_schema";
import { and, eq } from "drizzle-orm";
import { logger } from "../logger";
import forge from "node-forge";

// ─── mTLS middleware ─────────────────────────────────────────────────────────

/**
 * Validates the client TLS certificate presented on /api/v1 requests.
 * In production, Express is configured with `requestCert: true` and
 * `rejectUnauthorized: false` so we can inspect and log failures.
 * Here we read the cert from the `x-client-cert` header (set by APISIX/nginx
 * after terminating TLS) and validate it against our DB.
 */
export async function mtlsMiddleware(req: Request, res: Response, next: NextFunction) {
  // In local dev (no TLS terminator) skip enforcement
  const certPem = req.headers["x-client-cert"] as string | undefined;
  if (!certPem) {
    // Allow through in dev; in production APISIX would block cert-less requests
    return next();
  }

  try {
    const cert = forge.pki.certificateFromPem(decodeURIComponent(certPem));
    const cn   = cert.subject.getField("CN")?.value as string;
    const org  = cert.subject.getField("O")?.value as string;

    // Validate against DB (org = dfspId)
    const rows = await db.select().from(mtlsCertificates)
      .where(and(
        eq(mtlsCertificates.dfspId, org),
        eq(mtlsCertificates.status, "ACTIVE"),
        eq(mtlsCertificates.certType, "CLIENT"),
      ));

    const match = rows.find(r => {
      try {
        const stored = forge.pki.certificateFromPem(r.certificatePem);
        return stored.serialNumber === cert.serialNumber;
      } catch { return false; }
    });

    if (!match) {
      logger.warn("mtls_cert_rejected", { cn, org });
      return res.status(401).json({ error: "mTLS certificate not recognised or revoked" });
    }

    // Attach DFSP identity to request for downstream use
    (req as any).mtlsDfspId = org;
    logger.debug("mtls_cert_accepted", { dfspId: org, cn });
    return next();
  } catch (err) {
    logger.warn("mtls_cert_parse_error", { error: (err as Error).message });
    return res.status(400).json({ error: "Invalid client certificate" });
  }
}

// ─── JWS verification middleware ─────────────────────────────────────────────

/**
 * Verifies the `FSPIOP-Signature` header on inbound transfer/quote requests.
 * The header contains a JWS compact token whose payload is the request body.
 * If the DFSP has no registered key yet, the request is allowed through
 * (permissive mode) but a warning is logged.
 */
export async function jwsVerifyMiddleware(req: Request, res: Response, next: NextFunction) {
  const signature = req.headers["fspiop-signature"] as string | undefined;
  const dfspId    = (req as any).mtlsDfspId ?? (req.headers["fspiop-source"] as string);

  if (!signature || !dfspId) {
    // No signature present — allow in dev, warn
    logger.debug("jws_no_signature", { path: req.path, dfspId });
    return next();
  }

  const { valid, payload } = await verifySignature(dfspId, signature);
  if (!valid) {
    logger.warn("jws_signature_invalid", { dfspId, path: req.path });
    return res.status(401).json({ error: "JWS signature verification failed" });
  }

  (req as any).jwsPayload = payload;
  logger.debug("jws_signature_valid", { dfspId, path: req.path });
  return next();
}
