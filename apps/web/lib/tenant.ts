export const TENANT_COOKIE = "pc_tenant";
export const DEFAULT_TENANT = "demo";

/** Second cookie: a small tenantId -> apiKey map, learned at registration
 * time (see tenant-actions.ts's registerConnector) so the portal can
 * authenticate on behalf of a self-serve connector it registered in this
 * browser session. Keeping this separate from TENANT_COOKIE (which just
 * names the *current* tenant) means switching tenants never discards a key
 * the portal already learned. */
export const TENANT_KEYS_COOKIE = "pc_tenant_keys";

/** Well-known, intentionally-public keys for the two platform-seeded demo
 * tenants — the same pk_demo/pk_beta constants exported from
 * apps/api/src/tenants.ts, already published in the README. Fine to ship
 * here; never used for a real connected company's tenant. */
const WELL_KNOWN_API_KEYS: Record<string, string> = {
  demo: "pk_demo",
  beta: "pk_beta",
};

export function parseTenantKeys(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string",
        ),
      );
    }
  } catch {
    // ignore a malformed/tampered cookie — treat as empty
  }
  return {};
}

/** The API key to authenticate as `tenantId` with, if the portal knows one —
 * a well-known constant for demo/beta, or one learned from a self-serve
 * registration in this browser session. */
export function apiKeyFor(
  tenantId: string,
  learnedKeys: Record<string, string>,
): string | undefined {
  return WELL_KNOWN_API_KEYS[tenantId] ?? learnedKeys[tenantId];
}
