import type { BillingRepository } from "./billing.js";
import type { ClaimsRepository } from "./claims.js";
import type { PolicyRepository } from "./policy.js";

/**
 * A "connector" — the bundle of adapters a company provides to plug their own
 * system into pc-core. Implement these three interfaces against your own
 * database or expose them over HTTP per the reference REST contract
 * (see @pc-core/adapters), and every service — lifecycle, billing, claims,
 * documents, and the claims-AI capabilities — works against your data
 * unchanged. Billing/claims are optional: a connector can start with just
 * policy read/write and grow into the rest.
 */
export interface Connector {
  policy: PolicyRepository;
  billing?: BillingRepository;
  claims?: ClaimsRepository;
}

export interface TenantInfo {
  tenantId: string;
  name: string;
}
