/**
 * wave230/mtls.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * mTLS (Mutual TLS) certificate lifecycle management.
 *
 * This module manages the Certificate Authority (CA) and per-DFSP client
 * certificates used to enforce mutual TLS on the /api/v1 integration endpoint.
 *
 * In production the CA private key would be stored in an HSM slot.  Here we
 * use node-forge for pure-JS certificate generation, which is fully compatible
 * with OpenSSL and can be replaced by an HSM-backed CA without API changes.
 *
 * Flow:
 *   1. Hub generates a self-signed CA certificate on first boot (stored in DB)
 *   2. Each DFSP submits a CSR; the Hub signs it and returns the certificate
 *   3. The DFSP presents the certificate on every API call
 *   4. Express middleware (see wave230/middleware.ts) validates the cert chain
 */

import forge from "node-forge";
import { db } from "../db";
import { mtlsCertificates } from "../../drizzle/nexthub_schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";

const CA_SUBJECT = [
  { name: "commonName",         value: "NextHub Root CA" },
  { name: "organizationName",   value: "NextHub Payment Switch" },
  { name: "countryName",        value: "NG" },
];

// ─── Internal CA bootstrap ───────────────────────────────────────────────────

let caKey:  forge.pki.rsa.PrivateKey  | null = null;
let caCert: forge.pki.Certificate     | null = null;

async function ensureCA(): Promise<{ key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate }> {
  if (caKey && caCert) return { key: caKey, cert: caCert };

  const existing = await db.select().from(mtlsCertificates)
    .where(eq(mtlsCertificates.certType, "CA"))
    .limit(1);

  if (existing.length) {
    caKey  = forge.pki.privateKeyFromPem(existing[0].privateKeyPem!);
    caCert = forge.pki.certificateFromPem(existing[0].certificatePem);
    return { key: caKey, cert: caCert };
  }

  // Generate a new CA
  logger.info("mtls_ca_generating");
  const keypair = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) =>
    forge.pki.rsa.generateKeyPair({ bits: 4096, workers: -1 }, (err, kp) =>
      err ? reject(err) : resolve(kp)
    )
  );

  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  cert.setSubject(CA_SUBJECT);
  cert.setIssuer(CA_SUBJECT);
  cert.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true },
    { name: "subjectKeyIdentifier" },
  ]);
  cert.sign(keypair.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem  = forge.pki.privateKeyToPem(keypair.privateKey);

  await db.insert(mtlsCertificates).values({
    id: "nexthub-root-ca",
    dfspId: "NEXTHUB_HUB",
    certType: "CA",
    commonName: "NextHub Root CA",
    certificatePem: certPem,
    privateKeyPem: keyPem,
    issuedAt: new Date(),
    expiresAt: cert.validity.notAfter,
    status: "ACTIVE",
  });

  caKey  = keypair.privateKey;
  caCert = cert;
  logger.info("mtls_ca_generated");
  return { key: caKey, cert: caCert };
}

// ─── DFSP certificate issuance ───────────────────────────────────────────────

export interface IssueCertResult {
  certificatePem: string;
  caCertPem: string;
  serialNumber: string;
  expiresAt: Date;
}

export async function issueDfspCertificate(
  dfspId: string,
  commonName: string,
  csrPem?: string
): Promise<IssueCertResult> {
  const { key: caPrivKey, cert: caCertObj } = await ensureCA();

  // Generate DFSP keypair (or use CSR if provided)
  let dfspPublicKey: forge.pki.PublicKey;
  let dfspPrivateKeyPem: string | undefined;

  if (csrPem) {
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    dfspPublicKey = csr.publicKey as forge.pki.PublicKey;
  } else {
    const kp = await new Promise<forge.pki.rsa.KeyPair>((resolve, reject) =>
      forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 }, (err, k) =>
        err ? reject(err) : resolve(k)
      )
    );
    dfspPublicKey    = kp.publicKey;
    dfspPrivateKeyPem = forge.pki.privateKeyToPem(kp.privateKey);
  }

  const serial = Date.now().toString(16);
  const cert = forge.pki.createCertificate();
  cert.publicKey    = dfspPublicKey;
  cert.serialNumber = serial;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter  = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

  const subject = [
    { name: "commonName",       value: commonName },
    { name: "organizationName", value: dfspId },
    { name: "countryName",      value: "NG" },
  ];
  cert.setSubject(subject);
  cert.setIssuer(caCertObj.subject.attributes);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", clientAuth: true },
    { name: "subjectKeyIdentifier" },
    { name: "authorityKeyIdentifier", keyIdentifier: true },
  ]);
  cert.sign(caPrivKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const caPem   = forge.pki.certificateToPem(caCertObj);

  await db.insert(mtlsCertificates).values({
    id: `${dfspId}-${serial}`,
    dfspId,
    certType: "CLIENT",
    commonName,
    certificatePem: certPem,
    privateKeyPem: dfspPrivateKeyPem ?? null,
    serialNumber: serial,
    issuedAt: new Date(),
    expiresAt: cert.validity.notAfter,
    status: "ACTIVE",
  }).onConflictDoNothing();

  logger.info("mtls_cert_issued", { dfspId, serial });
  return { certificatePem: certPem, caCertPem: caPem, serialNumber: serial, expiresAt: cert.validity.notAfter };
}

// ─── Certificate revocation ──────────────────────────────────────────────────

export async function revokeCertificate(certId: string, reason: string): Promise<void> {
  await db.update(mtlsCertificates)
    .set({ status: "REVOKED", revokedAt: new Date(), revocationReason: reason })
    .where(eq(mtlsCertificates.id, certId));
  logger.info("mtls_cert_revoked", { certId, reason });
}

// ─── Certificate lookup ──────────────────────────────────────────────────────

export async function getDfspCertificates(dfspId: string) {
  return db.select().from(mtlsCertificates)
    .where(and(eq(mtlsCertificates.dfspId, dfspId), eq(mtlsCertificates.certType, "CLIENT")));
}

export async function getCACertPem(): Promise<string> {
  const { cert } = await ensureCA();
  return forge.pki.certificateToPem(cert);
}
