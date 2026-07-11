/**
 * nqrService.ts — Full NQR (Nigeria Quick Response) Payment Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the complete NQR lifecycle:
 *   1. EMVCo TLV payload construction (CBN NQR spec)
 *   2. Local QR code rendering (SVG + PNG) via the `qrcode` npm package
 *   3. Persistence in nqr_transactions table
 *   4. SSE registry for real-time payment status push to waiting clients
 *   5. NIBSS webhook ingestion to update local state and fire SSE events
 *   6. Background expiry sweep (called from backgroundJobs.ts)
 *
 * Language: TypeScript (Node.js)
 * Dependencies: qrcode (npm), drizzle-orm, Redis cache
 */
import QRCode from "qrcode";
import { eq, and, lt, inArray } from "drizzle-orm";
import { db } from "../db";
import { nqrTransactions, nqrMerchantProfiles } from "../../drizzle/nqr_schema";
import type { InsertNqrTransaction } from "../../drizzle/nqr_schema";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { publishKafkaEvent, NEXTHUB_KAFKA_TOPICS } from "../kafka/nexthubKafkaProducer";
import type { Response } from "express";

// ─── EMVCo TLV Payload Builder ────────────────────────────────────────────────
// CBN NQR follows the EMVCo Merchant-Presented QR Code Specification.
// Each field is encoded as Tag (2 digits) + Length (2 digits) + Value.

function tlv(tag: string, value: string): string {
  const len = String(value.length).padStart(2, "0");
  return `${tag}${len}${value}`;
}

function buildEmvcoPayload(opts: {
  merchantId: string;
  merchantName: string;
  bankCode: string;       // NIBSS bank code (3 digits)
  accountNumber: string;  // 10-digit NUBAN
  amountKobo?: number;
  currency?: string;      // ISO 4217 numeric, default "566" (NGN)
  reference: string;
  country?: string;       // ISO 3166-1 alpha-2, default "NG"
  city?: string;
}): string {
  const currency = opts.currency ?? "566";
  const country  = opts.country  ?? "NG";
  const city     = opts.city     ?? "Lagos";

  // Tag 00: Payload Format Indicator (always "01")
  let payload = tlv("00", "01");

  // Tag 01: Point of Initiation Method
  //   "11" = static QR (no amount), "12" = dynamic QR (with amount)
  payload += tlv("01", opts.amountKobo ? "12" : "11");

  // Tag 26: Merchant Account Information (NIBSS NQR sub-object)
  // Sub-tag 00: globally unique identifier for NIBSS NQR scheme
  // Sub-tag 01: bank code (3 digits)
  // Sub-tag 02: account number (10 digits NUBAN)
  const merchantAccountInfo =
    tlv("00", "com.nibss-plc.nqr") +
    tlv("01", opts.bankCode.padStart(3, "0")) +
    tlv("02", opts.accountNumber);
  payload += tlv("26", merchantAccountInfo);

  // Tag 52: Merchant Category Code (5999 = Miscellaneous)
  payload += tlv("52", "5999");

  // Tag 53: Transaction Currency
  payload += tlv("53", currency);

  // Tag 54: Transaction Amount (only for dynamic QR)
  if (opts.amountKobo) {
    // EMVCo amount is in major currency units with 2 decimal places
    const amountStr = (opts.amountKobo / 100).toFixed(2);
    payload += tlv("54", amountStr);
  }

  // Tag 58: Country Code
  payload += tlv("58", country);

  // Tag 59: Merchant Name (max 25 chars)
  payload += tlv("59", opts.merchantName.slice(0, 25));

  // Tag 60: Merchant City (max 15 chars)
  payload += tlv("60", city.slice(0, 15));

  // Tag 62: Additional Data Field Template
  // Sub-tag 05: Reference Label (order/invoice reference)
  const additionalData = tlv("05", opts.reference.slice(0, 25));
  payload += tlv("62", additionalData);

  // Tag 63: CRC (CRC-16/CCITT-FALSE over the payload including "6304")
  payload += "6304";
  const crc = crc16(payload);
  payload += crc.toString(16).toUpperCase().padStart(4, "0");

  return payload;
}

/** CRC-16/CCITT-FALSE algorithm as required by EMVCo QR spec */
function crc16(data: string): number {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF;
    }
  }
  return crc;
}

// ─── QR Code Rendering ────────────────────────────────────────────────────────

async function renderQrSvg(payload: string): Promise<string> {
  return QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

async function renderQrPng(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, {
    type: "image/png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}

// ─── SSE Registry for Real-Time Payment Status Push ──────────────────────────
// Maps QR reference → list of SSE response streams waiting for payment.

const _sseClients = new Map<string, Set<Response>>();

export function registerNqrSseClient(reference: string, res: Response): void {
  if (!_sseClients.has(reference)) {
    _sseClients.set(reference, new Set());
  }
  _sseClients.get(reference)!.add(res);

  // Clean up when client disconnects
  res.on("close", () => {
    _sseClients.get(reference)?.delete(res);
    if (_sseClients.get(reference)?.size === 0) {
      _sseClients.delete(reference);
    }
  });
}

function pushNqrSseEvent(reference: string, data: object): void {
  const clients = _sseClients.get(reference);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
  // If payment is terminal (PAID/EXPIRED/CANCELLED), close all SSE connections
  const status = (data as any).status;
  if (["PAID", "EXPIRED", "CANCELLED"].includes(status)) {
    for (const res of clients) {
      try { res.end(); } catch { /* ignore */ }
    }
    _sseClients.delete(reference);
  }
}

// ─── Generate QR Code (full lifecycle) ───────────────────────────────────────

export interface NqrGenerateOptions {
  merchantId: string;
  merchantName: string;
  bankCode: string;
  accountNumber: string;
  amountKobo?: number;
  currency?: string;
  reference: string;
  tenantId?: string;
  dfspId?: string;
  expiryMinutes?: number;
  qrType?: "DYNAMIC" | "STATIC";
}

export interface NqrGenerateResult {
  id: string;
  reference: string;
  qrString: string;
  qrSvg: string;
  qrPngBase64: string;
  expiresAt: Date;
  status: string;
}

export async function generateNqr(opts: NqrGenerateOptions): Promise<NqrGenerateResult> {
  const expiryMinutes = opts.expiryMinutes ?? 30;
  const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

  // Build EMVCo-compliant payload
  const qrString = buildEmvcoPayload({
    merchantId:    opts.merchantId,
    merchantName:  opts.merchantName,
    bankCode:      opts.bankCode,
    accountNumber: opts.accountNumber,
    amountKobo:    opts.amountKobo,
    currency:      opts.currency,
    reference:     opts.reference,
  });

  // Render QR code locally (no NIBSS dependency for image generation)
  const [qrSvg, qrPngBase64] = await Promise.all([
    renderQrSvg(qrString),
    renderQrPng(qrString),
  ]);

  // Persist to database
  const [row] = await db.insert(nqrTransactions).values({
    reference:    opts.reference,
    merchantId:   opts.merchantId,
    merchantName: opts.merchantName,
    tenantId:     opts.tenantId,
    dfspId:       opts.dfspId,
    amountKobo:   opts.amountKobo,
    currency:     opts.currency ?? "NGN",
    qrType:       opts.qrType ?? "DYNAMIC",
    qrString,
    qrSvg,
    qrPngBase64,
    status:       "PENDING",
    expiresAt,
  } satisfies InsertNqrTransaction).returning();

  // Cache the pending status for fast polling
  await cache.set("nqr:status", opts.reference, { status: "PENDING", expiresAt }, TTL.NQR_PENDING);

  logger.info("nqr_generated", {
    reference: opts.reference,
    merchantId: opts.merchantId,
    amountKobo: opts.amountKobo,
    expiryMinutes,
  });

  return {
    id:           row.id,
    reference:    row.reference,
    qrString:     row.qrString,
    qrSvg:        row.qrSvg ?? "",
    qrPngBase64:  row.qrPngBase64 ?? "",
    expiresAt:    row.expiresAt,
    status:       row.status,
  };
}

// ─── Get QR Status (fast path via cache) ─────────────────────────────────────

export async function getNqrStatus(reference: string): Promise<{
  status: string;
  paidAmountKobo?: number;
  nibssSessionId?: string;
  expiresAt?: Date;
} | null> {
  // Try Redis cache first
  const cached = await cache.get("nqr:status", reference) as any;
  if (cached) return cached;

  // Fall back to DB
  const [row] = await db
    .select({
      status:          nqrTransactions.status,
      paidAmountKobo:  nqrTransactions.paidAmountKobo,
      nibssSessionId:  nqrTransactions.nibssSessionId,
      expiresAt:       nqrTransactions.expiresAt,
    })
    .from(nqrTransactions)
    .where(eq(nqrTransactions.reference, reference))
    .limit(1);

  if (!row) return null;

  // Map null → undefined to satisfy the return type (Drizzle returns null for nullable columns)
  const result = {
    status:         row.status,
    paidAmountKobo: row.paidAmountKobo ?? undefined,
    nibssSessionId: row.nibssSessionId ?? undefined,
    expiresAt:      row.expiresAt ?? undefined,
  };
  // Re-cache for subsequent polls
  await cache.set("nqr:status", reference, result, TTL.NQR_PENDING);
  return result;
}

// ─── NIBSS Webhook Handler ────────────────────────────────────────────────────
// Called by the Express REST endpoint POST /api/v1/nqr/webhook

export interface NqrWebhookPayload {
  reference:        string;
  responseCode:     string;   // "00" = success
  amount:           number;   // in kobo
  sessionID:        string;
  payerAccountNo:   string;
  payerBankCode:    string;
  transactionDate:  string;
}

export async function handleNqrWebhook(payload: NqrWebhookPayload): Promise<void> {
  const paid = payload.responseCode === "00";
  const newStatus = paid ? "PAID" : "FAILED";

  logger.info("nqr_webhook_received", {
    reference: payload.reference,
    responseCode: payload.responseCode,
    sessionID: payload.sessionID,
  });

  // Update DB record
  await db.update(nqrTransactions)
    .set({
      status:             newStatus,
      paidAmountKobo:     paid ? payload.amount : undefined,
      payerAccountNumber: payload.payerAccountNo,
      payerBankCode:      payload.payerBankCode,
      nibssSessionId:     payload.sessionID,
      nibssResponseCode:  payload.responseCode,
      webhookReceivedAt:  new Date(),
      updatedAt:          new Date(),
    })
    .where(eq(nqrTransactions.reference, payload.reference));

  // Invalidate cache
  await cache.del("nqr:status", payload.reference);

  // Push SSE event to any waiting clients
  pushNqrSseEvent(payload.reference, {
    reference:       payload.reference,
    status:          newStatus,
    paidAmountKobo:  paid ? payload.amount : undefined,
    nibssSessionId:  payload.sessionID,
  });

  // Publish Kafka event for downstream reconciliation
  if (paid) {
    await publishKafkaEvent(NEXTHUB_KAFKA_TOPICS.TRANSFER_COMMITTED, {
      eventType:      "NQR_PAYMENT",
      reference:      payload.reference,
      amountKobo:     payload.amount,
      sessionId:      payload.sessionID,
      payerBankCode:  payload.payerBankCode,
      timestamp:      new Date().toISOString(),
    }).catch((err) =>
      logger.error("nqr_kafka_publish_failed", { reference: payload.reference, err: err?.message })
    );

    // Update merchant profile totals
    await db.execute(
      // Use raw SQL for atomic increment
      // drizzle-orm doesn't support UPDATE ... SET col = col + ? natively yet
      `UPDATE nqr_merchant_profiles
         SET total_transactions = total_transactions + 1,
             total_amount_kobo  = total_amount_kobo  + ${payload.amount},
             updated_at         = NOW()
       WHERE merchant_id = (
         SELECT merchant_id FROM nqr_transactions WHERE reference = '${payload.reference.replace(/'/g, "''")}' LIMIT 1
       )`
    );
  }
}

// ─── Background Expiry Sweep ──────────────────────────────────────────────────
// Called every 5 minutes from backgroundJobs.ts

export async function sweepExpiredNqrTransactions(): Promise<void> {
  const now = new Date();

  const expired = await db
    .update(nqrTransactions)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(
      and(
        eq(nqrTransactions.status, "PENDING"),
        lt(nqrTransactions.expiresAt, now)
      )
    )
    .returning({ reference: nqrTransactions.reference });

  if (expired.length > 0) {
    logger.info("nqr_expired_sweep", { count: expired.length });
    // Push SSE expiry events and invalidate cache
    await Promise.all(
      expired.map(async ({ reference }) => {
        pushNqrSseEvent(reference, { reference, status: "EXPIRED" });
        await cache.del("nqr:status", reference).catch(() => {});
      })
    );
  }
}

// ─── Generate Static Merchant QR ─────────────────────────────────────────────

export async function generateStaticMerchantQr(opts: {
  merchantId: string;
  merchantName: string;
  bankCode: string;
  accountNumber: string;
  tenantId?: string;
  dfspId?: string;
}): Promise<{ qrSvg: string; qrPngBase64: string; qrString: string }> {
  const qrString = buildEmvcoPayload({
    merchantId:    opts.merchantId,
    merchantName:  opts.merchantName,
    bankCode:      opts.bankCode,
    accountNumber: opts.accountNumber,
    // No amount = static/open QR
    reference:     `STATIC-${opts.merchantId}`,
  });

  const [qrSvg, qrPngBase64] = await Promise.all([
    renderQrSvg(qrString),
    renderQrPng(qrString),
  ]);

  // Upsert merchant profile with static QR
  await db.insert(nqrMerchantProfiles).values({
    merchantId:    opts.merchantId,
    merchantName:  opts.merchantName,
    tenantId:      opts.tenantId,
    dfspId:        opts.dfspId,
    bankCode:      opts.bankCode,
    accountNumber: opts.accountNumber,
    staticQrString: qrString,
    staticQrSvg:   qrSvg,
    staticQrPng:   qrPngBase64,
  }).onConflictDoUpdate({
    target: nqrMerchantProfiles.merchantId,
    set: {
      staticQrString: qrString,
      staticQrSvg:   qrSvg,
      staticQrPng:   qrPngBase64,
      updatedAt:     new Date(),
    },
  });

  return { qrSvg, qrPngBase64, qrString };
}
