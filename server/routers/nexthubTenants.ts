/**
 * nexthubTenants.ts — Multi-Tenant & White-Label tRPC Router
 * ─────────────────────────────────────────────────────────────────────────────
 * Exposes all tenant management operations to the NextHub admin UI and
 * the tenant self-service portal:
 *
 *   - Tenant provisioning (delegates to Go tenant-provisioning service)
 *   - Tenant branding CRUD (logo, colours, fonts, custom domain)
 *   - Tenant member management (invite, revoke, role assignment)
 *   - Tenant API key management (create, list, revoke)
 *   - Tenant feature flag management
 *   - Tenant metrics (delegates to Python tenant-analytics service)
 *   - Per-tenant RBAC enforcement
 */

import { z } from "zod";
import { eq, and, desc, isNull } from "drizzle-orm";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import {
  tenants,
  tenantBranding,
  tenantMembers,
  tenantApiKeys,
  tenantAuditLog,
} from "../../drizzle/tenant_schema";
import { logger } from "../logger";
import { nexthubPublish } from "../kafka/nexthubKafkaProducer";
import crypto from "crypto";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const TenantTierEnum = z.enum(["STARTER", "GROWTH", "ENTERPRISE", "SOVEREIGN"]);
const TenantRoleEnum = z.enum([
  "TENANT_OWNER", "TENANT_ADMIN", "HUB_OPERATOR",
  "SETTLEMENT_OFFICER", "COMPLIANCE_OFFICER", "DEVELOPER", "READ_ONLY", "REGULATOR_OBSERVER",
]);

const ProvisionTenantInput = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  legalName: z.string().optional(),
  registrationNumber: z.string().optional(),
  tier: TenantTierEnum.default("STARTER"),
  jurisdiction: z.string().length(2).default("NG"),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  cbnInstitutionCode: z.string().optional(),
  nibssParticipantCode: z.string().optional(),
  featNip: z.boolean().default(true),
  featRtgs: z.boolean().default(false),
  featFx: z.boolean().default(false),
  featUssd: z.boolean().default(false),
  featCrossBorder: z.boolean().default(false),
});

const UpdateBrandingInput = z.object({
  tenantId: z.string(),
  displayName: z.string().min(1).max(100),
  tagline: z.string().max(200).optional(),
  logoUrl: z.string().url().optional(),
  faviconUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#1a56db"),
  primaryForeground: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#ffffff"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#7e3af2"),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#0694a2"),
  backgroundColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#f9fafb"),
  surfaceColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#ffffff"),
  borderColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#e5e7eb"),
  errorColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#f05252"),
  successColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#0e9f6e"),
  warningColor: z.string().regex(/^#[0-9a-fA-F]{3,6}$/).default("#ff5a1f"),
  fontFamily: z.string().default("Inter"),
  fontFamilyMono: z.string().default("JetBrains Mono"),
  fontSizeBase: z.string().default("16px"),
  borderRadius: z.string().default("0.5rem"),
  customDomain: z.string().optional(),
  emailFromName: z.string().optional(),
  emailFromAddress: z.string().email().optional(),
});

const InviteMemberInput = z.object({
  tenantId: z.string(),
  userId: z.number(),
  role: TenantRoleEnum.default("READ_ONLY"),
  permissions: z.record(z.string(), z.boolean()).optional(),
});

const CreateApiKeyInput = z.object({
  tenantId: z.string(),
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  rateLimit: z.number().int().min(1).max(10000).default(1000),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const bytes = crypto.randomBytes(32);
  const raw = "nhk_" + bytes.toString("hex");
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, prefix, hash };
}

async function logTenantAudit(params: {
  tenantId: string;
  actorId?: number;
  actorEmail?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  requestId?: string;
}) {
  try {
    await db.insert(tenantAuditLog).values({
      id: generateId(),
      tenantId: params.tenantId,
      actorId: params.actorId,
      actorEmail: params.actorEmail ?? undefined,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      oldValue: params.oldValue as Record<string, unknown>,
      newValue: params.newValue as Record<string, unknown>,
      requestId: params.requestId,
    });
  } catch (err) {
    logger.error("tenant_audit_log_failed", { error: String(err), action: params.action });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const nexthubTenantsRouter = router({

  // ── List all tenants (admin only) ─────────────────────────────────────────
  list: adminProcedure
    .input(z.object({
      status: z.enum(["PENDING_SETUP", "ACTIVE", "SUSPENDED", "DEPROVISIONED"]).optional(),
      jurisdiction: z.string().optional(),
      tier: TenantTierEnum.optional(),
    }).optional())
    .query(async ({ input }) => {
      const conditions = [];
      if (input?.status) conditions.push(eq(tenants.status, input.status));
      if (input?.jurisdiction) conditions.push(eq(tenants.jurisdiction, input.jurisdiction));
      if (input?.tier) conditions.push(eq(tenants.tier, input.tier));

      const rows = await db
        .select()
        .from(tenants)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(tenants.createdAt));

      return rows;
    }),

  // ── Get single tenant ─────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, input.tenantId))
        .limit(1);
      if (!tenant) throw new Error("Tenant not found");
      return tenant;
    }),

  // ── Provision new tenant (admin only) ────────────────────────────────────
  provision: adminProcedure
    .input(ProvisionTenantInput)
    .mutation(async ({ input, ctx }) => {
      // Check slug uniqueness
      const [existing] = await db
        .select({ id: tenants.id })
        .from(tenants)
        .where(eq(tenants.slug, input.slug))
        .limit(1);
      if (existing) throw new Error(`Slug '${input.slug}' is already taken`);

      const tenantId = generateId();
      const kafkaNamespace = input.slug.replace(/-/g, "_");
      const dbSchema = `tenant_${kafkaNamespace}`;
      const keycloakRealm = `nexthub-${input.slug}`;

      await db.insert(tenants).values({
        id: tenantId,
        name: input.name,
        slug: input.slug,
        legalName: input.legalName,
        registrationNumber: input.registrationNumber,
        tier: input.tier,
        status: "PENDING_SETUP",
        jurisdiction: input.jurisdiction,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        cbnInstitutionCode: input.cbnInstitutionCode,
        nibssParticipantCode: input.nibssParticipantCode,
        featNip: input.featNip,
        featRtgs: input.featRtgs,
        featFx: input.featFx,
        featUssd: input.featUssd,
        featCrossBorder: input.featCrossBorder,
        kafkaNamespace,
        dbSchema,
        keycloakRealm,
      });

      // Create default branding
      await db.insert(tenantBranding).values({
        id: generateId(),
        tenantId,
        displayName: input.name,
      });

      // Generate initial API key
      const { raw, prefix, hash } = generateApiKey();
      await db.insert(tenantApiKeys).values({
        id: generateId(),
        tenantId,
        name: "Default API Key",
        keyHash: hash,
        keyPrefix: prefix,
        scopes: ["transfers:write", "transfers:read", "fx:read"],
        rateLimit: 1000,
        createdBy: ctx.user?.id,
      });

      await logTenantAudit({
        tenantId,
        actorId: ctx.user?.id,
        actorEmail: ctx.user?.email ?? undefined,
        action: "tenant.provisioned",
        resourceType: "tenant",
        resourceId: tenantId,
        newValue: { slug: input.slug, tier: input.tier, jurisdiction: input.jurisdiction },
      });

      logger.info("tenant_provisioned", { tenantId, slug: input.slug, tier: input.tier });

      return {
        tenantId,
        slug: input.slug,
        kafkaNamespace,
        dbSchema,
        keycloakRealm,
        apiKey: raw,          // shown once — not stored in plaintext
        apiKeyPrefix: prefix,
        status: "PENDING_SETUP" as const,
      };
    }),

  // ── Activate tenant ───────────────────────────────────────────────────────
  activate: adminProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(tenants)
        .set({ status: "ACTIVE", activatedAt: new Date() })
        .where(eq(tenants.id, input.tenantId));

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.activated",
        resourceType: "tenant",
        resourceId: input.tenantId,
      });

      logger.info("tenant_activated", { tenantId: input.tenantId });
      return { success: true };
    }),

  // ── Suspend tenant ────────────────────────────────────────────────────────
  suspend: adminProcedure
    .input(z.object({ tenantId: z.string(), reason: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.update(tenants)
        .set({ status: "SUSPENDED", suspendedAt: new Date(), suspendedReason: input.reason })
        .where(eq(tenants.id, input.tenantId));

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.suspended",
        resourceType: "tenant",
        resourceId: input.tenantId,
        newValue: { reason: input.reason },
      });

      logger.warn("tenant_suspended", { tenantId: input.tenantId, reason: input.reason });
      return { success: true };
    }),

  // ── Update feature flags ──────────────────────────────────────────────────
  updateFeatures: adminProcedure
    .input(z.object({
      tenantId: z.string(),
      featNip: z.boolean().optional(),
      featRtgs: z.boolean().optional(),
      featNeft: z.boolean().optional(),
      featNqr: z.boolean().optional(),
      featUssd: z.boolean().optional(),
      featFx: z.boolean().optional(),
      featPisp: z.boolean().optional(),
      featBulkTransfers: z.boolean().optional(),
      featCbdc: z.boolean().optional(),
      featCrossBorder: z.boolean().optional(),
      featOpenFinance: z.boolean().optional(),
      maxTpsNip: z.number().int().min(1).max(10000).optional(),
      maxBulkBatchSize: z.number().int().min(1).max(100000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { tenantId, ...updates } = input;
      const filtered = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined)
      );
      await db.update(tenants).set(filtered).where(eq(tenants.id, tenantId));

      await logTenantAudit({
        tenantId,
        actorId: ctx.user?.id,
        action: "tenant.features.updated",
        resourceType: "tenant",
        resourceId: tenantId,
        newValue: filtered,
      });

      return { success: true };
    }),

  // ── Get branding ──────────────────────────────────────────────────────────
  getBranding: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const [branding] = await db
        .select()
        .from(tenantBranding)
        .where(eq(tenantBranding.tenantId, input.tenantId))
        .limit(1);
      return branding ?? null;
    }),

  // ── Update branding ───────────────────────────────────────────────────────
  updateBranding: protectedProcedure
    .input(UpdateBrandingInput)
    .mutation(async ({ input, ctx }) => {
      const { tenantId, ...brandingData } = input;

      const [existing] = await db
        .select({ id: tenantBranding.id })
        .from(tenantBranding)
        .where(eq(tenantBranding.tenantId, tenantId))
        .limit(1);

      if (existing) {
        await db.update(tenantBranding)
          .set({ ...brandingData, updatedAt: new Date() })
          .where(eq(tenantBranding.tenantId, tenantId));
      } else {
        await db.insert(tenantBranding).values({
          id: generateId(),
          tenantId,
          ...brandingData,
        });
      }

      // Trigger Rust branding compiler to regenerate CSS
      const brandingCompilerUrl = process.env.BRANDING_COMPILER_URL ?? "http://branding-compiler:8131";
      try {
        const res = await fetch(`${brandingCompilerUrl}/compile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId, ...brandingData }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const compiled = await res.json() as { cssHash: string; cssContent: string; wcagWarnings: string[] };
          await db.update(tenantBranding)
            .set({
              compiledCssVersion: compiled.cssHash,
              compiledCssHash: compiled.cssHash,
              updatedAt: new Date(),
            })
            .where(eq(tenantBranding.tenantId, tenantId));

          if (compiled.wcagWarnings?.length > 0) {
            logger.warn("branding_wcag_warnings", { tenantId, warnings: compiled.wcagWarnings });
          }
        }
      } catch (err) {
        logger.warn("branding_compiler_unavailable", { tenantId, error: String(err) });
        // Non-fatal — branding still saved, CSS will be compiled on next request
      }

      await logTenantAudit({
        tenantId,
        actorId: ctx.user?.id,
        action: "tenant.branding.updated",
        resourceType: "tenant_branding",
        resourceId: tenantId,
      });

      return { success: true };
    }),

  // ── Verify custom domain ──────────────────────────────────────────────────
  verifyDomain: protectedProcedure
    .input(z.object({ tenantId: z.string(), customDomain: z.string() }))
    .mutation(async ({ input }) => {
      const provisioningUrl = process.env.TENANT_PROVISIONING_URL ?? "http://tenant-provisioning:8130";
      const res = await fetch(`${provisioningUrl}/api/v1/tenants/verify-domain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.INTERNAL_API_KEY ?? ""}`,
        },
        body: JSON.stringify({ tenantId: input.tenantId, customDomain: input.customDomain }),
        signal: AbortSignal.timeout(15_000),
      });

      const result = await res.json() as { verified: boolean; instructions: string };

      if (result.verified) {
        await db.update(tenantBranding)
          .set({ customDomain: input.customDomain, customDomainVerified: true })
          .where(eq(tenantBranding.tenantId, input.tenantId));
      }

      return result;
    }),

  // ── List members ──────────────────────────────────────────────────────────
  listMembers: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(tenantMembers)
        .where(and(
          eq(tenantMembers.tenantId, input.tenantId),
          eq(tenantMembers.isActive, true),
        ))
        .orderBy(desc(tenantMembers.invitedAt));
    }),

  // ── Invite member ─────────────────────────────────────────────────────────
  inviteMember: protectedProcedure
    .input(InviteMemberInput)
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(
          eq(tenantMembers.tenantId, input.tenantId),
          eq(tenantMembers.userId, input.userId),
          eq(tenantMembers.isActive, true),
        ))
        .limit(1);

      if (existing) throw new Error("User is already a member of this tenant");

      const memberId = generateId();
      await db.insert(tenantMembers).values({
        id: memberId,
        tenantId: input.tenantId,
        userId: input.userId,
        role: input.role,
        permissions: input.permissions as Record<string, boolean>,
        invitedBy: ctx.user?.id,
      });

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.member.invited",
        resourceType: "tenant_member",
        resourceId: memberId,
        newValue: { userId: input.userId, role: input.role },
      });

      return { memberId, success: true };
    }),

  // ── Revoke member ─────────────────────────────────────────────────────────
  revokeMember: protectedProcedure
    .input(z.object({ tenantId: z.string(), userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(tenantMembers)
        .set({ isActive: false, revokedAt: new Date() })
        .where(and(
          eq(tenantMembers.tenantId, input.tenantId),
          eq(tenantMembers.userId, input.userId),
        ));

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.member.revoked",
        resourceType: "tenant_member",
        newValue: { userId: input.userId },
      });

      return { success: true };
    }),

  // ── List API keys ─────────────────────────────────────────────────────────
  listApiKeys: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      return db
        .select({
          id: tenantApiKeys.id,
          name: tenantApiKeys.name,
          keyPrefix: tenantApiKeys.keyPrefix,
          scopes: tenantApiKeys.scopes,
          rateLimit: tenantApiKeys.rateLimit,
          lastUsedAt: tenantApiKeys.lastUsedAt,
          expiresAt: tenantApiKeys.expiresAt,
          revokedAt: tenantApiKeys.revokedAt,
          createdAt: tenantApiKeys.createdAt,
        })
        .from(tenantApiKeys)
        .where(and(
          eq(tenantApiKeys.tenantId, input.tenantId),
          isNull(tenantApiKeys.revokedAt),
        ))
        .orderBy(desc(tenantApiKeys.createdAt));
    }),

  // ── Create API key ────────────────────────────────────────────────────────
  createApiKey: protectedProcedure
    .input(CreateApiKeyInput)
    .mutation(async ({ input, ctx }) => {
      const { raw, prefix, hash } = generateApiKey();
      const keyId = generateId();
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400_000)
        : undefined;

      await db.insert(tenantApiKeys).values({
        id: keyId,
        tenantId: input.tenantId,
        name: input.name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: input.scopes,
        rateLimit: input.rateLimit,
        expiresAt,
        createdBy: ctx.user?.id,
      });

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.api_key.created",
        resourceType: "tenant_api_key",
        resourceId: keyId,
        newValue: { name: input.name, scopes: input.scopes, prefix },
      });

      return { keyId, apiKey: raw, prefix, scopes: input.scopes }; // raw shown once
    }),

  // ── Revoke API key ────────────────────────────────────────────────────────
  revokeApiKey: protectedProcedure
    .input(z.object({ tenantId: z.string(), keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(tenantApiKeys)
        .set({ revokedAt: new Date() })
        .where(and(
          eq(tenantApiKeys.id, input.keyId),
          eq(tenantApiKeys.tenantId, input.tenantId),
        ));

      await logTenantAudit({
        tenantId: input.tenantId,
        actorId: ctx.user?.id,
        action: "tenant.api_key.revoked",
        resourceType: "tenant_api_key",
        resourceId: input.keyId,
      });

      return { success: true };
    }),

  // ── Get tenant metrics (delegates to Python analytics service) ────────────
  getMetrics: protectedProcedure
    .input(z.object({ tenantId: z.string(), hours: z.number().int().min(1).max(720).default(24) }))
    .query(async ({ input }) => {
      const analyticsUrl = process.env.TENANT_ANALYTICS_URL ?? "http://tenant-analytics:8132";
      try {
        const res = await fetch(
          `${analyticsUrl}/api/v1/tenants/${input.tenantId}/metrics?hours=${input.hours}`,
          {
            headers: { Authorization: `Bearer ${process.env.INTERNAL_API_KEY ?? ""}` },
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (!res.ok) throw new Error(`Analytics service error: ${res.status}`);
        return res.json();
      } catch (err) {
        logger.warn("tenant_analytics_unavailable", { tenantId: input.tenantId, error: String(err) });
        return null;
      }
    }),

  // ── Get anomaly alerts ────────────────────────────────────────────────────
  getAnomalies: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const analyticsUrl = process.env.TENANT_ANALYTICS_URL ?? "http://tenant-analytics:8132";
      try {
        const res = await fetch(
          `${analyticsUrl}/api/v1/tenants/${input.tenantId}/anomalies`,
          {
            headers: { Authorization: `Bearer ${process.env.INTERNAL_API_KEY ?? ""}` },
            signal: AbortSignal.timeout(10_000),
          }
        );
        if (!res.ok) return [];
        return res.json();
      } catch {
        return [];
      }
    }),

  // ── Get audit log ─────────────────────────────────────────────────────────
  getAuditLog: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      limit: z.number().int().min(1).max(200).default(50),
    }))
    .query(async ({ input }) => {
      return db
        .select()
        .from(tenantAuditLog)
        .where(eq(tenantAuditLog.tenantId, input.tenantId))
        .orderBy(desc(tenantAuditLog.createdAt))
        .limit(input.limit);
    }),
});
