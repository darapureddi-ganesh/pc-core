import { randomBytes } from "node:crypto";
import {
  InMemoryAssignmentLogRepository,
  InMemoryBillingRepository,
  InMemoryClaimsRepository,
  InMemoryHandlersRepository,
  InMemoryPolicyRepository,
  RemoteHttpPolicyRepository,
} from "@pc-core/adapters";
import type { Connector, Handler, TenantInfo } from "@pc-core/ports";
import type { ClaimsAiProviders } from "./service/claims-service.js";
import { PolicyService } from "./service/policy-service.js";
import { BillingService } from "./service/billing-service.js";
import { ClaimsService } from "./service/claims-service.js";
import { ClaimQueueService } from "./service/claim-queue-service.js";
import { DocumentService } from "./service/document-service.js";

/** The full per-tenant service bundle the HTTP layer resolves and dispatches to. */
export interface TenantServices {
  info: TenantInfo;
  policy: PolicyService;
  billing: BillingService;
  claims: ClaimsService;
  claimQueue: ClaimQueueService;
  documents: DocumentService;
}

/** A handful of demo adjusters seeded for the "demo" tenant's claim queue. */
const DEMO_HANDLERS: Handler[] = [
  {
    handlerId: "h-1",
    name: "Asha Rao",
    expertise: ["MOTOR_ACCIDENT", "MOTOR_OTHER"],
    currentWorkload: 2,
    maxCapacity: 15,
    isAvailable: true,
    avgHandlingDays: 4,
    experienceYears: 6,
  },
  {
    handlerId: "h-2",
    name: "Vikram Shah",
    expertise: ["MOTOR_THEFT"],
    currentWorkload: 5,
    maxCapacity: 12,
    isAvailable: true,
    avgHandlingDays: 8,
    experienceYears: 9,
  },
  {
    handlerId: "h-3",
    name: "Neha Kulkarni",
    expertise: ["MOTOR_ACCIDENT", "MOTOR_THEFT", "MOTOR_OTHER"],
    currentWorkload: 1,
    maxCapacity: 10,
    isAvailable: false,
    avgHandlingDays: 3,
    experienceYears: 3,
  },
];

interface RegisteredTenant {
  info: TenantInfo;
  apiKey: string;
  services: TenantServices;
}

function buildServices(
  info: TenantInfo,
  connector: Connector,
  claimsAi?: ClaimsAiProviders,
  seedHandlers: Handler[] = [],
): TenantServices {
  const policy = new PolicyService(connector.policy);
  const billing = new BillingService(
    connector.billing ?? new InMemoryBillingRepository(),
  );
  const claimsRepo = connector.claims ?? new InMemoryClaimsRepository();
  const claims = new ClaimsService(claimsRepo, policy, claimsAi);
  const claimQueue = new ClaimQueueService(
    claimsRepo,
    new InMemoryHandlersRepository(seedHandlers),
    new InMemoryAssignmentLogRepository(),
  );
  const documents = new DocumentService(policy);
  return { info, policy, billing, claims, claimQueue, documents };
}

function newTenantId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${slug || "tenant"}-${randomBytes(3).toString("hex")}`;
}

function newApiKey(): string {
  return `pk_${randomBytes(20).toString("hex")}`;
}

/**
 * Registers one connector per connected company, keyed by both tenant ID and
 * API key, and resolves the matching service bundle per request. Every
 * service is identical code for every tenant — only the connector (where the
 * data actually lives) differs. This is the platform's tenant directory: a
 * company calls `registerConnector` once (see POST /connectors/register) and
 * gets back the key their system authenticates every subsequent call with.
 */
export class TenantRegistry {
  private readonly byTenantId = new Map<string, RegisteredTenant>();
  private readonly byApiKey = new Map<string, RegisteredTenant>();

  /** Register a tenant with an explicit ID and key — used to seed well-known demo tenants. */
  register(
    info: TenantInfo,
    connector: Connector,
    apiKey: string,
    claimsAi?: ClaimsAiProviders,
    seedHandlers?: Handler[],
  ): void {
    const entry: RegisteredTenant = {
      info,
      apiKey,
      services: buildServices(info, connector, claimsAi, seedHandlers),
    };
    this.byTenantId.set(info.tenantId, entry);
    this.byApiKey.set(apiKey, entry);
  }

  /**
   * Self-serve onboarding: a company points us at a REST service implementing
   * the policy connector contract (see @pc-core/adapters RemoteHttpPolicyRepository)
   * and gets back a tenant ID + API key. No code changes on pc-core's side.
   */
  registerConnector(name: string, policyBaseUrl: string): TenantInfo & { apiKey: string } {
    const info: TenantInfo = { tenantId: newTenantId(name), name };
    const apiKey = newApiKey();
    this.register(info, { policy: new RemoteHttpPolicyRepository(policyBaseUrl) }, apiKey);
    return { ...info, apiKey };
  }

  resolve(tenantId: string): TenantServices | undefined {
    return this.byTenantId.get(tenantId)?.services;
  }

  resolveByApiKey(apiKey: string): TenantServices | undefined {
    return this.byApiKey.get(apiKey)?.services;
  }

  list(): TenantInfo[] {
    return [...this.byTenantId.values()].map((t) => t.info);
  }
}

/** Well-known keys for the two seeded demo tenants — fine for a local demo, never for production. */
export const DEMO_API_KEY = "pk_demo";
export const ACME_API_KEY = "pk_acme";

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
    DEMO_API_KEY,
    undefined,
    DEMO_HANDLERS,
  );

  registry.register(
    { tenantId: "acme", name: "Acme Insurance (external system, via HTTP)" },
    { policy: new RemoteHttpPolicyRepository(acmeBaseUrl) },
    ACME_API_KEY,
  );

  return registry;
}
