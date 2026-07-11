/**
 * nqr_schema.ts — NQR (Nigeria Quick Response) QR Code Persistence Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores generated QR codes, their payment status, and webhook events.
 * Enables local status polling without round-tripping to NIBSS on every check.
 */
import {
  pgTable, text, bigint, boolean, timestamp, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── NQR Transactions ─────────────────────────────────────────────────────────
export const nqrTransactions = pgTable("nqr_transactions", {
  id:                  text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  reference:           text("reference").notNull().unique(),
  merchantId:          text("merchant_id").notNull(),
  merchantName:        text("merchant_name").notNull(),
  tenantId:            text("tenant_id"),
  dfspId:              text("dfsp_id"),
  amountKobo:          bigint("amount_kobo", { mode: "number" }),  // null = open amount
  currency:            text("currency").notNull().default("NGN"),
  qrType:              text("qr_type").notNull().default("DYNAMIC"), // DYNAMIC | STATIC
  qrString:            text("qr_string").notNull(),                 // EMVCo payload
  qrSvg:               text("qr_svg"),                              // rendered SVG
  qrPngBase64:         text("qr_png_base64"),                       // rendered PNG
  status:              text("status").notNull().default("PENDING"),  // PENDING | PAID | EXPIRED | CANCELLED
  paidAmountKobo:      bigint("paid_amount_kobo", { mode: "number" }),
  payerAccountNumber:  text("payer_account_number"),
  payerBankCode:       text("payer_bank_code"),
  nibssSessionId:      text("nibss_session_id"),
  nibssResponseCode:   text("nibss_response_code"),
  webhookReceivedAt:   timestamp("webhook_received_at"),
  expiresAt:           timestamp("expires_at").notNull(),
  createdAt:           timestamp("created_at").notNull().defaultNow(),
  updatedAt:           timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nqr_merchant_idx").on(t.merchantId),
  index("nqr_status_idx").on(t.status),
  index("nqr_expires_idx").on(t.expiresAt),
  index("nqr_tenant_idx").on(t.tenantId),
  // Composite: merchant + status for dashboard queries
  index("nqr_merchant_status_idx").on(t.merchantId, t.status),
  // Partial-style: active pending QRs (most-queried hot path)
  index("nqr_pending_expires_idx").on(t.status, t.expiresAt),
]);
export type NqrTransaction = typeof nqrTransactions.$inferSelect;
export type InsertNqrTransaction = typeof nqrTransactions.$inferInsert;

// ─── NQR Static Merchant Profiles ────────────────────────────────────────────
// A merchant can have a persistent static QR that never expires (amount is open).
export const nqrMerchantProfiles = pgTable("nqr_merchant_profiles", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  merchantId:    text("merchant_id").notNull().unique(),
  merchantName:  text("merchant_name").notNull(),
  tenantId:      text("tenant_id"),
  dfspId:        text("dfsp_id"),
  bankCode:      text("bank_code").notNull(),
  accountNumber: text("account_number").notNull(),
  currency:      text("currency").notNull().default("NGN"),
  staticQrString: text("static_qr_string"),
  staticQrSvg:   text("static_qr_svg"),
  staticQrPng:   text("static_qr_png_base64"),
  isActive:      boolean("is_active").notNull().default(true),
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalAmountKobo:   bigint("total_amount_kobo", { mode: "number" }).notNull().default(0),
  createdAt:     timestamp("created_at").notNull().defaultNow(),
  updatedAt:     timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("nqr_mp_tenant_idx").on(t.tenantId),
  index("nqr_mp_active_idx").on(t.isActive),
]);
export type NqrMerchantProfile = typeof nqrMerchantProfiles.$inferSelect;
