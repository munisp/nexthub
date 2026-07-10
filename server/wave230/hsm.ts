/**
 * wave230/hsm.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Software HSM (Hardware Security Module) emulation layer.
 *
 * In production this module wraps a PKCS#11 provider (e.g. AWS CloudHSM,
 * Thales Luna, or SoftHSM2 via pkcs11js).  In development / sandbox mode it
 * uses node-jose's in-memory JWK store, which is cryptographically sound but
 * not hardware-backed.
 *
 * Responsibilities:
 *  - Generate and store RSA-PSS / EC key pairs per DFSP
 *  - Sign arbitrary payloads (JWS compact serialisation)
 *  - Verify inbound JWS signatures against stored public keys
 *  - Export public JWK for DFSP key-exchange
 */

import jose from "node-jose";
import { db } from "../db";
import { jwsKeys } from "../../drizzle/nexthub_schema";
import { eq, and } from "drizzle-orm";
import { logger } from "../logger";

// ─── In-memory key store (populated on first use) ─────────────────────────────
const keystore = jose.JWK.createKeyStore();
let keystoreLoaded = false;

async function ensureKeystoreLoaded(): Promise<void> {
  if (keystoreLoaded) return;
  try {
    const rows = await db.select().from(jwsKeys).where(eq(jwsKeys.isActive, true));
    for (const row of rows) {
      try {
        await keystore.add(JSON.parse(row.privateJwk), "json");
      } catch {
        // key may already be in store
      }
    }
    keystoreLoaded = true;
  } catch (err) {
    logger.warn("hsm_keystore_load_failed", { error: (err as Error).message });
  }
}

// ─── Key generation ───────────────────────────────────────────────────────────

export interface GenerateKeyResult {
  keyId: string;
  dfspId: string;
  algorithm: string;
  publicJwk: object;
}

export async function generateDfspKeyPair(
  dfspId: string,
  algorithm: "RS256" | "RS384" | "RS512" | "PS256" | "ES256" | "ES384" = "PS256"
): Promise<GenerateKeyResult> {
  await ensureKeystoreLoaded();

  const keyType = algorithm.startsWith("E") ? "EC" : "RSA";
  const keySize = keyType === "RSA" ? 2048 : undefined;
  const crv = algorithm === "ES256" ? "P-256" : algorithm === "ES384" ? "P-384" : undefined;

  const props: Record<string, unknown> = {
    alg: algorithm,
    use: "sig",
    kid: `${dfspId}-${Date.now()}`,
  };
  if (crv) props.crv = crv;

  const key = await keystore.generate(keyType, keySize ?? crv ?? "P-256", props);
  const privateJwk = key.toJSON(true);   // include private material
  const publicJwk  = key.toJSON(false);  // public only

  // Persist to DB
  await db.insert(jwsKeys).values({
    id: key.kid,
    dfspId,
    algorithm,
    keyType,
    publicJwk: JSON.stringify(publicJwk),
    privateJwk: JSON.stringify(privateJwk),
    isActive: true,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  }).onConflictDoNothing();

  logger.info("hsm_key_generated", { dfspId, algorithm, kid: key.kid });

  return { keyId: key.kid, dfspId, algorithm, publicJwk };
}

// ─── JWS signing ─────────────────────────────────────────────────────────────

export async function signPayload(
  dfspId: string,
  payload: object | string
): Promise<string> {
  await ensureKeystoreLoaded();

  const row = await db.select().from(jwsKeys)
    .where(and(eq(jwsKeys.dfspId, dfspId), eq(jwsKeys.isActive, true)))
    .limit(1);

  if (!row.length) {
    throw new Error(`No active JWS key found for DFSP ${dfspId}`);
  }

  const key = await keystore.get(row[0].id);
  if (!key) {
    // Key not in memory store yet — add it
    const loaded = await keystore.add(JSON.parse(row[0].privateJwk), "json");
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const sign = jose.JWS.createSign({ format: "compact", fields: { alg: row[0].algorithm } }, loaded);
    sign.update(body, "utf8");
    return sign.final() as unknown as string;
  }

  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const sign = jose.JWS.createSign({ format: "compact", fields: { alg: row[0].algorithm } }, key);
  sign.update(body, "utf8");
  return sign.final() as unknown as string;
}

// ─── JWS verification ────────────────────────────────────────────────────────

export async function verifySignature(
  dfspId: string,
  token: string
): Promise<{ valid: boolean; payload: unknown }> {
  await ensureKeystoreLoaded();

  const row = await db.select().from(jwsKeys)
    .where(and(eq(jwsKeys.dfspId, dfspId), eq(jwsKeys.isActive, true)))
    .limit(1);

  if (!row.length) {
    return { valid: false, payload: null };
  }

  try {
    const ks = jose.JWK.createKeyStore();
    await ks.add(JSON.parse(row[0].publicJwk), "json");
    const result = await jose.JWS.createVerify(ks).verify(token);
    return { valid: true, payload: JSON.parse(result.payload.toString()) };
  } catch {
    return { valid: false, payload: null };
  }
}

// ─── Public key export ───────────────────────────────────────────────────────

export async function getPublicJwk(dfspId: string): Promise<object | null> {
  const row = await db.select().from(jwsKeys)
    .where(and(eq(jwsKeys.dfspId, dfspId), eq(jwsKeys.isActive, true)))
    .limit(1);
  if (!row.length) return null;
  return JSON.parse(row[0].publicJwk);
}

// ─── Key rotation ────────────────────────────────────────────────────────────

export async function rotateDfspKey(dfspId: string): Promise<GenerateKeyResult> {
  // Deactivate existing keys
  await db.update(jwsKeys)
    .set({ isActive: false, revokedAt: new Date() })
    .where(and(eq(jwsKeys.dfspId, dfspId), eq(jwsKeys.isActive, true)));

  // Invalidate in-memory cache so next operation reloads
  keystoreLoaded = false;

  return generateDfspKeyPair(dfspId);
}
