/**
 * Keycloak OIDC router.
 *
 * Exposes the following tRPC procedures:
 *
 *   auth.keycloak.getAuthUrl     — Build the Keycloak authorization URL with PKCE
 *   auth.keycloak.callback       — Exchange auth code → tokens → session cookie
 *   auth.keycloak.refresh        — Refresh the Keycloak access token
 *   auth.keycloak.logout         — Clear session + build Keycloak end-session URL
 *   auth.keycloak.me             — Return the current user's Keycloak claims + roles
 *   auth.keycloak.provisionUser  — Admin: provision a user in Keycloak + DB
 *   auth.keycloak.assignRole     — Admin: assign a Keycloak realm role to a user
 *   auth.keycloak.removeRole     — Admin: remove a Keycloak realm role from a user
 *   auth.keycloak.listUsers      — Admin: list users in the nexthub realm
 *   auth.keycloak.getUser        — Admin: get a single Keycloak user by sub
 *   auth.keycloak.deleteUser     — Admin: delete a Keycloak user
 *   auth.keycloak.createTenantRealm  — Hub operator: create a tenant sub-realm
 *   auth.keycloak.deleteTenantRealm  — Hub operator: delete a tenant sub-realm
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  verifyAccessToken,
  refreshAccessToken,
  buildEndSessionUrl,
  extractRole,
  extractAllRoles,
  createSessionToken,
  generatePkceVerifier,
  generatePkceChallenge,
  generateState,
  type KeycloakClaims,
} from "../_core/keycloak";
import { ENV } from "../_core/env";
import * as db from "../db";
import { COOKIE_NAME } from "@shared/const";

// ─── In-memory PKCE state store ───────────────────────────────────────────────
// In production, replace with Redis-backed store for multi-instance deployments.
// TTL: 10 minutes (PKCE state is short-lived).
const pkceStore = new Map<string, { verifier: string; expiresAt: number }>();

function storePkce(state: string, verifier: string): void {
  pkceStore.set(state, { verifier, expiresAt: Date.now() + 10 * 60 * 1000 });
  // Prune expired entries
  for (const [k, v] of pkceStore.entries()) {
    if (v.expiresAt < Date.now()) pkceStore.delete(k);
  }
}

function consumePkce(state: string): string | null {
  const entry = pkceStore.get(state);
  if (!entry) return null;
  pkceStore.delete(state);
  if (entry.expiresAt < Date.now()) return null;
  return entry.verifier;
}

// ─── Keycloak Admin API helper ────────────────────────────────────────────────

async function getAdminToken(): Promise<string> {
  const tokenUrl = `${ENV.keycloakUrl}/realms/master/protocol/openid-connect/token`;
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: ENV.keycloakAdminUser,
    password: ENV.keycloakAdminPassword,
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Keycloak admin token failed: ${text}`,
    });
  }
  const data = await res.json() as Record<string, unknown>;
  return data.access_token as string;
}

async function kcAdminGet(path: string): Promise<unknown> {
  const token = await getAdminToken();
  const res = await fetch(`${ENV.keycloakUrl}/admin/realms/${ENV.keycloakRealm}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Keycloak: ${text}` });
  }
  return res.json();
}

async function kcAdminPost(path: string, body: unknown): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${ENV.keycloakUrl}/admin/realms/${ENV.keycloakRealm}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function kcAdminPut(path: string, body: unknown): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${ENV.keycloakUrl}/admin/realms/${ENV.keycloakRealm}${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function kcAdminDelete(path: string): Promise<Response> {
  const token = await getAdminToken();
  return fetch(`${ENV.keycloakUrl}/admin/realms/${ENV.keycloakRealm}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const keycloakRouter = router({

  // ── Get authorization URL (with PKCE) ──────────────────────────────────────
  getAuthUrl: publicProcedure
    .input(z.object({
      redirectUri: z.string().url(),
    }))
    .query(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Keycloak is not configured (KEYCLOAK_URL is not set)",
        });
      }
      const state = generateState();
      const verifier = generatePkceVerifier();
      const challenge = await generatePkceChallenge(verifier);
      storePkce(state, verifier);
      const authUrl = buildAuthorizationUrl(input.redirectUri, state, challenge);
      return { authUrl, state };
    }),

  // ── Authorization Code callback ────────────────────────────────────────────
  callback: publicProcedure
    .input(z.object({
      code: z.string(),
      state: z.string(),
      redirectUri: z.string().url(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Keycloak is not configured",
        });
      }

      // Retrieve and consume the PKCE verifier for this state
      const codeVerifier = consumePkce(input.state) ?? undefined;

      // Exchange code for tokens
      let tokens;
      try {
        tokens = await exchangeCodeForTokens(input.code, input.redirectUri, codeVerifier);
      } catch (err: any) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `Token exchange failed: ${err?.message}`,
        });
      }

      // Verify and decode the access token
      let claims: KeycloakClaims;
      try {
        claims = await verifyAccessToken(tokens.accessToken, { skipAudienceCheck: false });
      } catch (err: any) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `Token verification failed: ${err?.message}`,
        });
      }

      const openId = claims.sub;
      const name = claims.name ?? claims.preferred_username ?? "";
      const email = claims.email ?? "";
      const role = extractRole(claims);
      const allRoles = extractAllRoles(claims);

      // Upsert user in the database
      await db.upsertUser({
        openId,
        name,
        email,
        loginMethod: "keycloak",
        role,
        lastSignedIn: new Date(),
      });

      // Issue our own HS256 session cookie
      const sessionToken = await createSessionToken(openId, name);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
        path: "/",
      });

      return {
        openId,
        name,
        email,
        role,
        roles: allRoles,
        tenantId: claims.tenant_id ?? null,
        tenantSlug: claims.tenant_slug ?? null,
        // Return refresh token for client-side storage (httpOnly cookie alternative)
        refreshToken: tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      };
    }),

  // ── Refresh access token ───────────────────────────────────────────────────
  refresh: publicProcedure
    .input(z.object({ refreshToken: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      try {
        const tokens = await refreshAccessToken(input.refreshToken);
        const claims = await verifyAccessToken(tokens.accessToken, { skipAudienceCheck: false });
        return {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          roles: extractAllRoles(claims),
        };
      } catch (err: any) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: `Token refresh failed: ${err?.message}`,
        });
      }
    }),

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout: publicProcedure
    .input(z.object({
      postLogoutRedirectUri: z.string().url(),
      idTokenHint: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Clear the session cookie
      ctx.res.clearCookie(COOKIE_NAME, { path: "/" });

      // Build the Keycloak end-session URL
      const endSessionUrl = ENV.keycloakUrl
        ? buildEndSessionUrl(input.postLogoutRedirectUri, input.idTokenHint)
        : input.postLogoutRedirectUri;

      return { endSessionUrl };
    }),

  // ── Get current user's Keycloak claims ────────────────────────────────────
  me: protectedProcedure
    .query(async ({ ctx }) => {
      const user = ctx.user!;
      return {
        openId: user.openId,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: (user as any).tenantId ?? null,
      };
    }),

  // ── Provision a user in Keycloak + DB ─────────────────────────────────────
  provisionUser: adminProcedure
    .input(z.object({
      username: z.string().min(3).max(64),
      email: z.string().email(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      temporaryPassword: z.string().min(8),
      roles: z.array(z.string()).default(["citizen"]),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }

      // Create user in Keycloak
      const createRes = await kcAdminPost("/users", {
        username: input.username,
        email: input.email,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        enabled: true,
        emailVerified: false,
        credentials: [{ type: "password", value: input.temporaryPassword, temporary: true }],
        attributes: input.tenantId ? { tenant_id: [input.tenantId] } : {},
      });

      if (!createRes.ok && createRes.status !== 409) {
        const text = await createRes.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Keycloak user creation failed: ${text}`,
        });
      }

      // Get the created user's UUID from the Location header
      const location = createRes.headers.get("Location") ?? "";
      const keycloakUserId = location.split("/").pop() ?? "";

      // Assign roles
      if (input.roles.length > 0 && keycloakUserId) {
        // Get role representations
        const allRoles = await kcAdminGet("/roles") as Array<{ id: string; name: string }>;
        const rolesToAssign = allRoles.filter(r => input.roles.includes(r.name));
        if (rolesToAssign.length > 0) {
          await kcAdminPost(`/users/${keycloakUserId}/role-mappings/realm`, rolesToAssign);
        }
      }

      return {
        keycloakUserId,
        username: input.username,
        email: input.email,
        roles: input.roles,
        provisioned: true,
      };
    }),

  // ── Assign a realm role to a user ─────────────────────────────────────────
  assignRole: adminProcedure
    .input(z.object({
      keycloakUserId: z.string(),
      role: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const roleRep = await kcAdminGet(`/roles/${input.role}`) as { id: string; name: string };
      await kcAdminPost(
        `/users/${input.keycloakUserId}/role-mappings/realm`,
        [roleRep]
      );
      return { assigned: true, role: input.role, userId: input.keycloakUserId };
    }),

  // ── Remove a realm role from a user ───────────────────────────────────────
  removeRole: adminProcedure
    .input(z.object({
      keycloakUserId: z.string(),
      role: z.string(),
    }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const roleRep = await kcAdminGet(`/roles/${input.role}`) as { id: string; name: string };
      const token = await getAdminToken();
      await fetch(
        `${ENV.keycloakUrl}/admin/realms/${ENV.keycloakRealm}/users/${input.keycloakUserId}/role-mappings/realm`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([roleRep]),
        }
      );
      return { removed: true, role: input.role, userId: input.keycloakUserId };
    }),

  // ── List users in the realm ────────────────────────────────────────────────
  listUsers: adminProcedure
    .input(z.object({
      search: z.string().optional(),
      first: z.number().int().min(0).default(0),
      max: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const params = new URLSearchParams({
        first: String(input.first),
        max: String(input.max),
      });
      if (input.search) params.set("search", input.search);
      const users = await kcAdminGet(`/users?${params}`) as Array<{
        id: string;
        username: string;
        email: string;
        firstName: string;
        lastName: string;
        enabled: boolean;
        emailVerified: boolean;
        createdTimestamp: number;
      }>;
      return users;
    }),

  // ── Get a single user by Keycloak UUID ────────────────────────────────────
  getUser: adminProcedure
    .input(z.object({ keycloakUserId: z.string() }))
    .query(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const user = await kcAdminGet(`/users/${input.keycloakUserId}`);
      const roles = await kcAdminGet(
        `/users/${input.keycloakUserId}/role-mappings/realm`
      ) as Array<{ name: string }>;
      return { user, roles: roles.map(r => r.name) };
    }),

  // ── Delete a user ──────────────────────────────────────────────────────────
  deleteUser: adminProcedure
    .input(z.object({ keycloakUserId: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      await kcAdminDelete(`/users/${input.keycloakUserId}`);
      return { deleted: true, keycloakUserId: input.keycloakUserId };
    }),

  // ── Create a tenant sub-realm ──────────────────────────────────────────────
  createTenantRealm: adminProcedure
    .input(z.object({
      slug: z.string().min(3).max(32).regex(/^[a-z0-9-]+$/),
      displayName: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const realmId = `nexthub-${input.slug}`;
      const token = await getAdminToken();
      const res = await fetch(`${ENV.keycloakUrl}/admin/realms`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          realm: realmId,
          displayName: input.displayName ?? realmId,
          enabled: true,
          sslRequired: "external",
          bruteForceProtected: true,
          defaultSignatureAlgorithm: "RS256",
        }),
      });
      if (!res.ok && res.status !== 409) {
        const text = await res.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Tenant realm creation failed: ${text}`,
        });
      }
      return { realmId, created: res.status !== 409, alreadyExists: res.status === 409 };
    }),

  // ── Delete a tenant sub-realm ──────────────────────────────────────────────
  deleteTenantRealm: adminProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ input }) => {
      if (!ENV.keycloakUrl) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Keycloak not configured" });
      }
      const realmId = `nexthub-${input.slug}`;
      const token = await getAdminToken();
      const res = await fetch(`${ENV.keycloakUrl}/admin/realms/${realmId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Tenant realm deletion failed: ${text}`,
        });
      }
      return { realmId, deleted: true };
    }),
});
