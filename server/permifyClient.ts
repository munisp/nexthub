/**
 * permifyClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Permify authorization client.
 * In production, PERMIFY_URL must be set to the Permify gRPC/HTTP endpoint.
 * When PERMIFY_URL is not set, all permission checks fail-open (allow).
 *
 * Permify is an open-source authorization service based on Google Zanzibar.
 * Docs: https://docs.permify.co
 */

const PERMIFY_URL = process.env.PERMIFY_URL ?? "";
const PERMIFY_TENANT = process.env.PERMIFY_TENANT ?? "nexthub";

/**
 * Check if a subject (user) can perform an action on a resource (merchant).
 * Returns true if allowed, false if denied.
 *
 * Fail-open when Permify is not configured.
 */
export async function canPerformMerchantAction(
  subjectId: string,
  merchantId: string,
  action: string
): Promise<boolean> {
  if (!PERMIFY_URL) {
    // Fail-open: no Permify configured
    return true;
  }
  try {
    const res = await fetch(`${PERMIFY_URL}/v1/tenants/${PERMIFY_TENANT}/permissions/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { schema_version: "", snap_token: "", depth: 20 },
        entity: { type: "merchant", id: merchantId },
        permission: action,
        subject: { type: "user", id: subjectId },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return true; // fail-open on HTTP error
    const data = await res.json() as { can?: string };
    return data.can === "CHECK_RESULT_ALLOWED";
  } catch {
    // Fail-open on network error / timeout
    return true;
  }
}

/**
 * Generic Permify check: subject can perform action on any entity type.
 * Used by all tRPC routers for fine-grained PBAC.
 */
export async function checkPermify(
  subjectId: string,
  entityType: string,
  entityId: string,
  action: string,
): Promise<boolean> {
  if (!PERMIFY_URL) return true;
  try {
    const res = await fetch(`${PERMIFY_URL}/v1/tenants/${PERMIFY_TENANT}/permissions/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { schema_version: "", snap_token: "", depth: 20 },
        entity: { type: entityType, id: entityId },
        permission: action,
        subject: { type: "user", id: subjectId },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return true;
    const data = await res.json() as { can?: string };
    return data.can === "CHECK_RESULT_ALLOWED";
  } catch {
    return true;
  }
}

/**
 * Check if a user can perform an action on a nexthub participant (DFSP).
 */
export async function canActOnParticipant(
  subjectId: string,
  participantId: string,
  action: string,
): Promise<boolean> {
  return checkPermify(subjectId, "participant", participantId, action);
}

/**
 * Check if a user can perform an action on a dispute.
 */
export async function canActOnDispute(
  subjectId: string,
  disputeId: string,
  action: string,
): Promise<boolean> {
  return checkPermify(subjectId, "dispute", disputeId, action);
}

/**
 * Check if a user has a specific role in the nexthub scheme.
 */
export async function hasRole(userId: string, role: string): Promise<boolean> {
  if (!PERMIFY_URL) return true;
  try {
    const res = await fetch(`${PERMIFY_URL}/v1/tenants/${PERMIFY_TENANT}/permissions/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metadata: { schema_version: "", snap_token: "", depth: 20 },
        entity: { type: "scheme", id: "nexthub" },
        permission: role,
        subject: { type: "user", id: userId },
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return true;
    const data = await res.json() as { can?: string };
    return data.can === "CHECK_RESULT_ALLOWED";
  } catch {
    return true;
  }
}
