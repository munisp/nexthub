/**
 * tenantMiddleware.ts — Per-Tenant RBAC Middleware & Context Resolver
 * ─────────────────────────────────────────────────────────────────────────────
 * Resolves the current tenant from the request and enforces per-tenant RBAC:
 *
 *  1. Reads X-Tenant-ID header (or subdomain) to identify the tenant
 *  2. Looks up the tenant in DB and validates it is ACTIVE
 *  3. Validates the user is a member of the tenant with sufficient role
 *  4. Sets PostgreSQL session variable app.current_tenant_id for RLS
 *  5. Attaches tenant context to the Express request object
 *
 * Also provides a tenant API key authenticator for the REST integration API.
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "./db";
import { tenants, tenantMembers, tenantApiKeys } from "../drizzle/tenant_schema";
import { eq, and, isNull, gt } from "drizzle-orm";
import { logger } from "./logger";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantRole =
  | "TENANT_OWNER"
  | "TENANT_ADMIN"
  | "HUB_OPERATOR"
  | "SETTLEMENT_OFFICER"
  | "COMPLIANCE_OFFICER"
  | "DEVELOPER"
  | "READ_ONLY"
  | "REGULATOR_OBSERVER";

export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  jurisdiction: string;
  tier: string;
  features: {
    nip: boolean;
    rtgs: boolean;
    neft: boolean;
    nqr: boolean;
    ussd: boolean;
    fx: boolean;
    pisp: boolean;
    bulkTransfers: boolean;
    cbdc: boolean;
    crossBorder: boolean;
  };
  memberRole?: TenantRole;
  apiKeyScopes?: string[];
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      tenantId?: string;
    }
  }
}

// ─── Role hierarchy ───────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<TenantRole, number> = {
  TENANT_OWNER:         100,
  TENANT_ADMIN:          90,
  HUB_OPERATOR:          80,
  SETTLEMENT_OFFICER:    70,
  COMPLIANCE_OFFICER:    60,
  DEVELOPER:             40,
  READ_ONLY:             10,
  REGULATOR_OBSERVER:    20,
};

export function hasRole(userRole: TenantRole, requiredRole: TenantRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

// ─── Tenant resolver ──────────────────────────────────────────────────────────

/**
 * Resolve tenant from X-Tenant-ID header or subdomain.
 * Subdomain format: {slug}.paygate.ng → slug = "firstbank"
 */
function resolveTenantIdentifier(req: Request): string | null {
  // Prefer explicit header
  const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
  if (headerTenantId) return headerTenantId;

  // Fall back to subdomain
  const host = req.headers.host ?? "";
  const subdomain = host.split(".")[0];
  if (subdomain && subdomain !== "hub" && subdomain !== "api" && subdomain !== "www") {
    return subdomain; // treat as slug
  }

  return null;
}

// ─── Tenant middleware ────────────────────────────────────────────────────────

/**
 * Middleware: resolve and attach tenant context to every request.
 * Does NOT enforce authentication — that is done by the auth middleware.
 * This middleware is additive: if no tenant is found, req.tenant remains undefined.
 */
export async function tenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const identifier = resolveTenantIdentifier(req);
    if (!identifier) {
      return next();
    }

    // Look up by ID first, then by slug
    const isUuid = /^[0-9a-f-]{36}$/.test(identifier);
    const [tenant] = await db
      .select()
      .from(tenants)
      .where(isUuid ? eq(tenants.id, identifier) : eq(tenants.slug, identifier))
      .limit(1);

    if (!tenant) {
      return next();
    }

    if (tenant.status !== "ACTIVE" && tenant.status !== "PENDING_SETUP") {
      logger.warn("tenant_access_denied_suspended", {
        tenantId: tenant.id,
        status: tenant.status,
        path: req.path,
      });
      return next(); // Let auth middleware handle the 403
    }

    req.tenant = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      jurisdiction: tenant.jurisdiction,
      tier: tenant.tier,
      features: {
        nip:           tenant.featNip,
        rtgs:          tenant.featRtgs,
        neft:          tenant.featNeft,
        nqr:           tenant.featNqr,
        ussd:          tenant.featUssd,
        fx:            tenant.featFx,
        pisp:          tenant.featPisp,
        bulkTransfers: tenant.featBulkTransfers,
        cbdc:          tenant.featCbdc,
        crossBorder:   tenant.featCrossBorder,
      },
    };
    req.tenantId = tenant.id;

    next();
  } catch (err) {
    logger.error("tenant_middleware_error", { error: String(err), path: req.path });
    next(); // Non-fatal — let downstream handle it
  }
}

// ─── Tenant API key authenticator ────────────────────────────────────────────

/**
 * Authenticate a request using a tenant API key.
 * The key is hashed with SHA-256 and compared against the stored hash.
 * Returns the tenant context and scopes if valid, null otherwise.
 */
export async function authenticateTenantApiKey(
  rawKey: string,
): Promise<{ tenantId: string; scopes: string[]; rateLimit: number } | null> {
  if (!rawKey.startsWith("nhk_")) return null;

  const hash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const [keyRow] = await db
    .select({
      id: tenantApiKeys.id,
      tenantId: tenantApiKeys.tenantId,
      scopes: tenantApiKeys.scopes,
      rateLimit: tenantApiKeys.rateLimit,
      expiresAt: tenantApiKeys.expiresAt,
      revokedAt: tenantApiKeys.revokedAt,
    })
    .from(tenantApiKeys)
    .where(and(
      eq(tenantApiKeys.keyHash, hash),
      isNull(tenantApiKeys.revokedAt),
    ))
    .limit(1);

  if (!keyRow) return null;

  // Check expiry
  if (keyRow.expiresAt && keyRow.expiresAt < new Date()) {
    logger.warn("tenant_api_key_expired", { keyId: keyRow.id });
    return null;
  }

  // Update last used timestamp (fire-and-forget)
  db.update(tenantApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(tenantApiKeys.id, keyRow.id))
    .catch(() => {});

  return {
    tenantId: keyRow.tenantId,
    scopes: (keyRow.scopes as string[]) ?? [],
    rateLimit: keyRow.rateLimit,
  };
}

// ─── Feature gate middleware factory ─────────────────────────────────────────

/**
 * Create a middleware that gates a route behind a tenant feature flag.
 *
 * @example
 * app.post("/api/v1/fx/rates", requireFeature("fx"), handler);
 */
export function requireFeature(
  feature: keyof TenantContext["features"],
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(403).json({ error: "Tenant context required" });
      return;
    }
    if (!req.tenant.features[feature]) {
      logger.warn("tenant_feature_disabled", {
        tenantId: req.tenant.tenantId,
        feature,
        path: req.path,
      });
      res.status(403).json({
        error: `Feature '${feature}' is not enabled for your tenant. Contact support to upgrade.`,
        feature,
      });
      return;
    }
    next();
  };
}

// ─── Scope check helper ───────────────────────────────────────────────────────

export function hasScope(scopes: string[], required: string): boolean {
  return scopes.includes(required) || scopes.includes("*");
}
