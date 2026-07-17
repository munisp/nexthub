/**
 * Keycloak OIDC integration for the PayGate Merchant Portal.
 *
 * Replaces Manus OAuth with Keycloak's standard Authorization Code flow.
 * Uses jose for RS256 JWT verification against Keycloak's JWKS endpoint.
 *
 * Environment variables required:
 *   KEYCLOAK_URL          — e.g. https://auth.paygate.io
 *   KEYCLOAK_REALM        — e.g. paygate
 *   KEYCLOAK_CLIENT_ID    — e.g. merchant-portal
 *   KEYCLOAK_CLIENT_SECRET — confidential client secret
 */

import { createRemoteJWKSet, jwtVerify } from "jose";
import { ENV } from "./env";

// ─── Keycloak URL helpers ─────────────────────────────────────────────────────

export function getKeycloakBaseUrl(): string {
  return `${ENV.keycloakUrl}/realms/${ENV.keycloakRealm}`;
}

export function getAuthorizationEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/auth`;
}

export function getTokenEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/token`;
}

export function getJwksUri(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/certs`;
}

export function getEndSessionEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/logout`;
}

export function getUserInfoEndpoint(): string {
  return `${getKeycloakBaseUrl()}/protocol/openid-connect/userinfo`;
}

// ─── JWKS cache ──────────────────────────────────────────────────────────────
// createRemoteJWKSet caches the key set and refreshes on key rotation automatically.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(getJwksUri()));
  }
  return _jwks;
}

// ─── Authorization URL ───────────────────────────────────────────────────────

// ─── PKCE helpers ────────────────────────────────────────────────────────────

import crypto from "crypto";

export function generatePkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function generatePkceChallenge(verifier: string): Promise<string> {
  const hash = crypto.createHash("sha256").update(verifier).digest();
  return hash.toString("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function buildAuthorizationUrl(
  redirectUri: string,
  state: string,
  codeChallenge?: string
): string {
  const url = new URL(getAuthorizationEndpoint());
  url.searchParams.set("client_id", ENV.keycloakClientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email roles");
  url.searchParams.set("state", state);
  if (codeChallenge) {
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url.toString();
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface KeycloakTokenSet {
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<KeycloakTokenSet> {
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: ENV.keycloakClientId,
    client_secret: ENV.keycloakClientSecret,
    code,
    redirect_uri: redirectUri,
  };
  if (codeVerifier) params.code_verifier = codeVerifier;
  const body = new URLSearchParams(params);

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Keycloak] Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    idToken: data.id_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
  };
}

// ─── JWT verification ─────────────────────────────────────────────────────────

// All NextHub stakeholder roles as defined in the nexthub Keycloak realm
export type NextHubRole =
  | "nexthub-admin"
  | "hub-operator"
  | "dfsp-admin"
  | "dfsp-user"
  | "compliance-officer"
  | "partner"
  | "citizen"
  | "auditor";

export interface KeycloakClaims {
  sub: string;           // Keycloak user UUID — used as openId
  email?: string;
  name?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  // Tenant context — populated by the nexthub-bridge client mapper
  tenant_id?: string;
  tenant_slug?: string;
}

export async function verifyAccessToken(
  accessToken: string,
  options?: { skipAudienceCheck?: boolean }
): Promise<KeycloakClaims> {
  const jwks = getJwks();
  const verifyOptions: Parameters<typeof jwtVerify>[2] = {
    issuer: getKeycloakBaseUrl(),
  };
  if (!options?.skipAudienceCheck) {
    verifyOptions.audience = ENV.keycloakClientId;
  }
  const { payload } = await jwtVerify(accessToken, jwks, verifyOptions);
  return payload as unknown as KeycloakClaims;
}

/**
 * Extract all Keycloak realm roles for the user.
 * Returns the full list so callers can check any role.
 */
export function extractAllRoles(claims: KeycloakClaims): string[] {
  const realmRoles = claims.realm_access?.roles ?? [];
  const clientRoles = claims.resource_access?.[ENV.keycloakClientId]?.roles ?? [];
  return [...new Set([...realmRoles, ...clientRoles])];
}

/**
 * Check if the claims include a specific NextHub role.
 */
export function hasRole(claims: KeycloakClaims, role: NextHubRole | string): boolean {
  return extractAllRoles(claims).includes(role);
}

/**
 * Check if the claims include ANY of the specified roles.
 */
export function hasAnyRole(claims: KeycloakClaims, roles: (NextHubRole | string)[]): boolean {
  const userRoles = extractAllRoles(claims);
  return roles.some(r => userRoles.includes(r));
}

/**
 * Map Keycloak realm roles to the DB user_role enum ("admin" | "user").
 * nexthub-admin and hub-operator map to "admin"; all others map to "user".
 */
export function extractRole(claims: KeycloakClaims): "admin" | "user" {
  const allRoles = extractAllRoles(claims);
  const adminRoles: string[] = [
    "nexthub-admin", "hub-operator",
    // Legacy PayGate roles
    "paygate-admin", "admin",
  ];
  return adminRoles.some(r => allRoles.includes(r)) ? "admin" : "user";
}

// ─── End-session URL builder ─────────────────────────────────────────────────

/**
 * Build the Keycloak end-session URL.
 *
 * Redirecting the browser here terminates the Keycloak SSO session so the
 * user must re-authenticate with credentials on the next login attempt.
 * Without this, the Keycloak session cookie persists and the user would be
 * silently re-authenticated on shared / kiosk machines.
 *
 * @param idTokenHint  The Keycloak id_token — if provided, Keycloak skips the
 *                     "do you want to log out?" confirmation page.
 * @param postLogoutRedirectUri  Where Keycloak should redirect after logout.
 *                               Must match a URI registered in the client config.
 */
export function buildEndSessionUrl(
  postLogoutRedirectUri: string,
  idTokenHint?: string
): string {
  const url = new URL(getEndSessionEndpoint());
  url.searchParams.set("client_id", ENV.keycloakClientId);
  url.searchParams.set("post_logout_redirect_uri", postLogoutRedirectUri);
  if (idTokenHint) {
    url.searchParams.set("id_token_hint", idTokenHint);
  }
  return url.toString();
}

// ─── Refresh token exchange ──────────────────────────────────────────────────

/**
 * Exchange a Keycloak refresh_token for a new token set.
 *
 * Called by the /api/auth/refresh endpoint when the portal session JWT is
 * approaching expiry. Returns a fresh KeycloakTokenSet (new access_token,
 * id_token, and possibly a rotated refresh_token).
 *
 * Throws if the refresh_token is expired or revoked — the caller should
 * clear the session and redirect to login.
 */
export async function refreshAccessToken(refreshToken: string): Promise<KeycloakTokenSet> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: ENV.keycloakClientId,
    client_secret: ENV.keycloakClientSecret,
    refresh_token: refreshToken,
  });

  const res = await fetch(getTokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Keycloak] Token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json() as Record<string, unknown>;
  return {
    accessToken: data.access_token as string,
    idToken: data.id_token as string,
    refreshToken: data.refresh_token as string | undefined,
    expiresIn: data.expires_in as number,
  };
}

// ─── Session cookie helpers ───────────────────────────────────────────────────
// We continue to issue our own HS256 session cookie (same as before) so the
// rest of the application (protectedProcedure, ctx.user) is unchanged.
// The Keycloak access token is NOT stored in the cookie — only the internal
// session JWT is, which references the user's openId (= Keycloak sub).

import { SignJWT, jwtVerify as joseVerify } from "jose";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

function getSessionSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(openId: string, name: string): Promise<string> {
  return new SignJWT({ openId, appId: "paygate-keycloak", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(Math.floor((Date.now() + ONE_YEAR_MS) / 1000))
    .sign(getSessionSecret());
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ openId: string; name: string } | null> {
  if (!token) return null;
  try {
    const secret = getSessionSecret();
    const { payload } = await joseVerify(token, secret, { algorithms: ["HS256"] });
    const { openId, name } = payload as Record<string, unknown>;
    if (typeof openId !== "string" || !openId) return null;
    return { openId, name: typeof name === "string" ? name : "" };
  } catch {
    return null;
  }
}

export { COOKIE_NAME };
