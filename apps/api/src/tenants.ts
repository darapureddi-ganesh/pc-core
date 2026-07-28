import {
  InMemoryBillingRepository,
  InMemoryClaimsRepository,
  InMemoryPolicyRepository,
  RemoteHttpPolicyRepository,
} from "@pc-core/adapters";
import type { Connector, TenantInfo } from "@pc-core/ports";
import { PolicyService } from "./service/policy-service.js";
import { BillingService } from "./service/billing-service.js";
import { ClaimsService } from "./service/claims-service.js";
import { DocumentService } from "./service/document-service.js";

/** The full per-tenant service bundle the HTTP layer resolves and dispatches to. */
export interface TenantServices {
  info: TenantInfo;
  policy: PolicyService;
  billing: BillingService;
  claims: ClaimsService;
  documents: DocumentService;
}

function buildServices(connector: Connector): Omit<TenantServices, "info"> {
  const policy = new PolicyService(connector.policy);
  const billing = new BillingService(
    connector.billing ?? new InMemoryBillingRepository(),
  );
  const claims = new ClaimsService(
    connector.claims ?? new InMemoryClaimsRepository(),
    policy,
  );
  const documents = new DocumentService(policy);
  return { policy, billing, claims, documents };
}

/**
 * Registers one connector per connected company and resolves the matching
 * service bundle per request. Every service above is identical code for
 * every tenant — only the connector (where the data actually lives) differs.
 */
export class TenantRegistry {
  private readonly tenants = new Map<string, TenantServices>();

  register(info: TenantInfo, connector: Connector): void {
    this.tenants.set(info.tenantId, { info, ...buildServices(connector) });
  }

  resolve(tenantId: string): TenantServices | undefined {
    return this.tenants.get(tenantId);
  }

  list(): TenantInfo[] {
    return [...this.tenants.values()].map((t) => t.info);
  }
}

/**
 * The demo registry: a "demo" tenant on pc-core's own in-memory store, and an
 * "acme" tenant whose policy data lives entirely in a separate process
 * (apps/mock-insurer) reached only over HTTP, with its own different internal
 * schema. Same PolicyService code, two genuinely different backends.
 */
export function buildDemoRegistry(
  acmeBaseUrl = process.env.ACME_URL ?? "http://127.0.0.1:4000",
): TenantRegistry {
  const registry = new TenantRegistry();

  registry.register(
    { tenantId: "demo", name: "pc-core demo (in-memory)" },
    { policy: new InMemoryPolicyRepository("PC-2026") },
  );

  registry.register(
    { tenantId: "acme", name: "Acme Insurance (external system, via HTTP)" },
    { policy: new RemoteHttpPolicyRepository(acmeBaseUrl) },
  );

  return registry;
}
