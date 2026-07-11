/**
 * tenant_schema.ts — Multi-Tenant & White-Label Schema
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the database schema for full multi-tenant isolation and white-label
 * support. Each tenant (hub operator, fintech, bank) gets:
 *
 *   - Isolated row-level security via tenantId on all tables
 *   - Custom branding (logo, colours, fonts, domain)
 *   - Per-tenant feature flags (NIBSS, FX, PISP, USSD, etc.)
 *   - Per-tenant RBAC roles and permission sets
 *   - Per-tenant Kafka topic namespacing
 *   - Per-tenant regulatory jurisdiction config
 *
 * Row-Level Security (RLS) is enforced at the PostgreSQL level via the
 * SET app.current_tenant_id = '<id>' session variable, which is set by
 * the tenant middleware on every request.
 */

import {
  pgTable, text, boolean, timestamp, jsonb, integer, pgEnum, uniqueIndex, index,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const tenantStatusEnum = pgEnum("tenant_status", [
  "PENDING_SETUP",
  "ACTIVE",
  "SUSPENDED",
  "DEPROVISIONED",
]);

export const tenantTierEnum = pgEnum("tenant_tier", [
  "STARTER",      // single region, limited TPS
  "GROWTH",       // multi-region, standard TPS
  "ENTERPRISE",   // continental, unlimited TPS, dedicated infra
  "SOVEREIGN",    // central bank / regulator tier
]);

export const tenantRoleEnum = pgEnum("tenant_role", [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "HUB_OPERATOR",
  "SETTLEMENT_OFFICER",
  "COMPLIANCE_OFFICER",
  "DEVELOPER",
  "READ_ONLY",
  "REGULATOR_OBSERVER",
]);

// ─── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable("tenants", {
  id:                  text("id").primaryKey(),
  name:                text("name").notNull(),
  slug:                text("slug").notNull().unique(),          // used in subdomain: {slug}.paygate.ng
  legalName:           text("legal_name"),
  registrationNumber:  text("registration_number"),
  tier:                tenantTierEnum("tier").notNull().default("STARTER"),
  status:              tenantStatusEnum("status").notNull().default("PENDING_SETUP"),

  // Regulatory context
  jurisdiction:        text("jurisdiction").notNull().default("NG"),  // ISO 3166-1 alpha-2
  regulatoryLicense:   text("regulatory_license"),
  cbnInstitutionCode:  text("cbn_institution_code"),
  nibssParticipantCode: text("nibss_participant_code"),

  // Contact
  contactEmail:        text("contact_email").notNull(),
  contactPhone:        text("contact_phone"),
  supportEmail:        text("support_email"),
  webhookUrl:          text("webhook_url"),
  webhookSecret:       text("webhook_secret"),

  // Feature flags (per-tenant capability gating)
  featNip:             boolean("feat_nip").notNull().default(true),
  featRtgs:            boolean("feat_rtgs").notNull().default(false),
  featNeft:            boolean("feat_neft").notNull().default(false),
  featNqr:             boolean("feat_nqr").notNull().default(false),
  featUssd:            boolean("feat_ussd").notNull().default(false),
  featFx:              boolean("feat_fx").notNull().default(false),
  featPisp:            boolean("feat_pisp").notNull().default(false),
  featBulkTransfers:   boolean("feat_bulk_transfers").notNull().default(true),
  featCbdc:            boolean("feat_cbdc").notNull().default(false),
  featCrossBorder:     boolean("feat_cross_border").notNull().default(false),
  featOpenFinance:     boolean("feat_open_finance").notNull().default(false),

  // Rate limits (overrides global defaults)
  maxTpsNip:           integer("max_tps_nip").notNull().default(100),
  maxTpsRtgs:          integer("max_tps_rtgs").notNull().default(10),
  maxBulkBatchSize:    integer("max_bulk_batch_size").notNull().default(1000),

  // Kafka namespace (all events prefixed: nexthub.{kafkaNamespace}.*)
  kafkaNamespace:      text("kafka_namespace").notNull(),

  // Provisioned infrastructure
  dbSchema:            text("db_schema"),                        // PostgreSQL schema name for schema-per-tenant isolation
  keycloakRealm:       text("keycloak_realm"),                   // Keycloak realm for tenant SSO
  keycloakClientId:    text("keycloak_client_id"),

  createdAt:           timestamp("created_at").defaultNow(),
  updatedAt:           timestamp("updated_at").defaultNow(),
  activatedAt:         timestamp("activated_at"),
  suspendedAt:         timestamp("suspended_at"),
  suspendedReason:     text("suspended_reason"),
}, (t) => [
  uniqueIndex("tenants_slug_idx").on(t.slug),
  index("tenants_status_idx").on(t.status),
  index("tenants_jurisdiction_idx").on(t.jurisdiction),
]);

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

// ─── Tenant Branding ──────────────────────────────────────────────────────────
export const tenantBranding = pgTable("tenant_branding", {
  id:                  text("id").primaryKey(),
  tenantId:            text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),

  // Identity
  displayName:         text("display_name").notNull(),
  tagline:             text("tagline"),
  logoUrl:             text("logo_url"),
  faviconUrl:          text("favicon_url"),
  logomarkUrl:         text("logomark_url"),                     // square icon version

  // Colour palette (CSS custom properties)
  primaryColor:        text("primary_color").notNull().default("#1a56db"),
  primaryForeground:   text("primary_foreground").notNull().default("#ffffff"),
  secondaryColor:      text("secondary_color").notNull().default("#7e3af2"),
  accentColor:         text("accent_color").notNull().default("#0694a2"),
  backgroundColor:     text("background_color").notNull().default("#f9fafb"),
  surfaceColor:        text("surface_color").notNull().default("#ffffff"),
  borderColor:         text("border_color").notNull().default("#e5e7eb"),
  errorColor:          text("error_color").notNull().default("#f05252"),
  successColor:        text("success_color").notNull().default("#0e9f6e"),
  warningColor:        text("warning_color").notNull().default("#ff5a1f"),

  // Typography
  fontFamily:          text("font_family").notNull().default("Inter"),
  fontFamilyMono:      text("font_family_mono").notNull().default("JetBrains Mono"),
  fontSizeBase:        text("font_size_base").notNull().default("16px"),
  borderRadius:        text("border_radius").notNull().default("0.5rem"),

  // Custom domain
  customDomain:        text("custom_domain"),                    // e.g. hub.firstbank.ng
  customDomainVerified: boolean("custom_domain_verified").notNull().default(false),
  tlsCertArn:          text("tls_cert_arn"),                     // ACM cert ARN for custom domain

  // Custom CSS override (compiled by Rust branding-compiler service)
  compiledCssUrl:      text("compiled_css_url"),
  compiledCssVersion:  text("compiled_css_version"),
  compiledCssHash:     text("compiled_css_hash"),

  // Email templates
  emailFromName:       text("email_from_name"),
  emailFromAddress:    text("email_from_address"),
  emailHeaderColor:    text("email_header_color"),

  // Extended config (JSON)
  customConfig:        jsonb("custom_config"),

  createdAt:           timestamp("created_at").defaultNow(),
  updatedAt:           timestamp("updated_at").defaultNow(),
}, (t) => [
  uniqueIndex("tenant_branding_tenant_idx").on(t.tenantId),
  index("tenant_branding_domain_idx").on(t.customDomain),
]);

export type TenantBranding = typeof tenantBranding.$inferSelect;
export type InsertTenantBranding = typeof tenantBranding.$inferInsert;

// ─── Tenant Members (per-tenant user roles) ───────────────────────────────────
export const tenantMembers = pgTable("tenant_members", {
  id:          text("id").primaryKey(),
  tenantId:    text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId:      integer("user_id").notNull(),                     // references users.id from main schema
  role:        tenantRoleEnum("role").notNull().default("READ_ONLY"),
  permissions: jsonb("permissions"),                             // fine-grained permission overrides
  invitedBy:   integer("invited_by"),
  invitedAt:   timestamp("invited_at").defaultNow(),
  acceptedAt:  timestamp("accepted_at"),
  revokedAt:   timestamp("revoked_at"),
  isActive:    boolean("is_active").notNull().default(true),
}, (t) => [
  uniqueIndex("tenant_members_unique_idx").on(t.tenantId, t.userId),
  index("tenant_members_tenant_idx").on(t.tenantId),
  index("tenant_members_user_idx").on(t.userId),
]);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type InsertTenantMember = typeof tenantMembers.$inferInsert;

// ─── Tenant API Keys ──────────────────────────────────────────────────────────
export const tenantApiKeys = pgTable("tenant_api_keys", {
  id:            text("id").primaryKey(),
  tenantId:      text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  name:          text("name").notNull(),
  keyHash:       text("key_hash").notNull().unique(),            // SHA-256 of the raw key
  keyPrefix:     text("key_prefix").notNull(),                   // first 8 chars for display
  scopes:        jsonb("scopes").notNull(),                      // ["transfers:write", "fx:read", ...]
  rateLimit:     integer("rate_limit").notNull().default(1000),  // req/min
  lastUsedAt:    timestamp("last_used_at"),
  expiresAt:     timestamp("expires_at"),
  revokedAt:     timestamp("revoked_at"),
  createdBy:     integer("created_by"),
  createdAt:     timestamp("created_at").defaultNow(),
}, (t) => [
  index("tenant_api_keys_tenant_idx").on(t.tenantId),
  uniqueIndex("tenant_api_keys_hash_idx").on(t.keyHash),
]);

export type TenantApiKey = typeof tenantApiKeys.$inferSelect;
export type InsertTenantApiKey = typeof tenantApiKeys.$inferInsert;

// ─── Tenant Audit Log ─────────────────────────────────────────────────────────
export const tenantAuditLog = pgTable("tenant_audit_log", {
  id:          text("id").primaryKey(),
  tenantId:    text("tenant_id").notNull(),
  actorId:     integer("actor_id"),
  actorEmail:  text("actor_email"),
  action:      text("action").notNull(),                         // e.g. "tenant.branding.updated"
  resourceType: text("resource_type"),
  resourceId:  text("resource_id"),
  oldValue:    jsonb("old_value"),
  newValue:    jsonb("new_value"),
  ipAddress:   text("ip_address"),
  userAgent:   text("user_agent"),
  requestId:   text("request_id"),
  createdAt:   timestamp("created_at").defaultNow(),
}, (t) => [
  index("tenant_audit_log_tenant_idx").on(t.tenantId),
  index("tenant_audit_log_created_idx").on(t.createdAt),
]);

export type TenantAuditLog = typeof tenantAuditLog.$inferSelect;
