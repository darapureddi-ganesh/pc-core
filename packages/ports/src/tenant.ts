import type { BillingRepository } from "./billing.js";
import type {
  AssignmentLogRepository,
  ClaimsRepository,
  HandlersRepository,
} from "./claims.js";
import type { CustomerRepository } from "./customer.js";
import type { PolicyRepository } from "./policy.js";

/**
 * A "connector" — the bundle of adapters a company provides to plug their own
 * system into OpenCover. Implement these interfaces against your own database
 * or expose them over HTTP per the reference REST contract (see
 * @pc-core/adapters), and every service — lifecycle, billing, claims,
 * claim-queue, documents, and the claims-AI capabilities — works against your
 * data unchanged. Everything but policy is optional: a connector can start
 * with just policy read/write and grow into the rest.
 */
export interface Connector {
  policy: PolicyRepository;
  billing?: BillingRepository;
  claims?: ClaimsRepository;
  handlers?: HandlersRepository;
  assignmentLog?: AssignmentLogRepository;
  customers?: CustomerRepository;
}

export interface TenantInfo {
  tenantId: string;
  name: string;
}
