import { randomBytes } from "node:crypto";
import {
  InMemoryAssignmentLogRepository,
  InMemoryBillingRepository,
  InMemoryClaimsRepository,
  InMemoryCustomerRepository,
  InMemoryHandlersRepository,
  InMemoryPolicyRepository,
  MappedRemoteHttpPolicyRepository,
  MockVehicleRegistry,
  PostgresAssignmentLogRepository,
  PostgresBillingRepository,
  PostgresClaimsRepository,
  PostgresCustomerRepository,
  PostgresHandlersRepository,
  PostgresPolicyRepository,
  PostgresTenantRegistryStore,
  RemoteHttpPolicyRepository,
} from "@pc-core/adapters";
import { createDb, type Db } from "@pc-core/db/client";
import {
  LlmDocumentExtractor,
  LlmFraudScorer,
  LlmTriageAdvisor,
  OllamaLlmClient,
  OpenAiCompatibleLlmClient,
  type OllamaClientOptions,
  type OpenAiCompatibleClientOptions,
  type TriageAdvisor,
} from "@pc-core/claims-ai";
import type { PolicyEnvelopeMapping } from "@pc-core/schema-mapping";
import type {
  Connector,
  Handler,
  RegisteredConnectorRecord,
  TenantInfo,
  TenantRegistryStore,
} from "@pc-core/ports";
import { policyFieldMappingSchema } from "./schemas.js";
import type { ClaimsAiProviders } from "./service/claims-service.js";
import { PolicyService } from "./service/policy-service.js";
import { BillingService } from "./service/billing-service.js";
import { ClaimsService } from "./service/claims-service.js";
import { ClaimQueueService } from "./service/claim-queue-service.js";
import { CustomerService } from "./service/customer-service.js";
import { DocumentService } from "./service/document-service.js";
import { RenewalService } from "./service/renewal-service.js";

/** The full per-tenant service bundle the HTTP layer resolves and dispatches to. */
export interface TenantServices {
  info: TenantInfo;
  policy: PolicyService;
  billing: BillingService;
  claims: ClaimsService;
  claimQueue: ClaimQueueService;
  customers: CustomerService;
  documents: DocumentService;
  renewals: RenewalService;
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
  triageAdvisor?: TriageAdvisor,
): TenantServices {
  const policy = new PolicyService(connector.policy);
  const billing = new BillingService(
    connector.billing ?? new InMemoryBillingRepository(),
  );
  const claimsRepo = connector.claims ?? new InMemoryClaimsRepository();
  const claims = new ClaimsService(claimsRepo, policy, claimsAi);
  const claimQueue = new ClaimQueueService(
    claimsRepo,
    connector.handlers ?? new InMemoryHandlersRepository(seedHandlers),
    connector.assignmentLog ?? new InMemoryAssignmentLogRepository(),
    undefined, // company rules: use ClaimQueueService's own DEFAULT_COMPANY_RULES
    triageAdvisor,
  );
  const customers = new CustomerService(
    connector.customers ?? new InMemoryCustomerRepository(),
    policy,
    claimsRepo,
  );
  const documents = new DocumentService(policy);
  const renewals = new RenewalService(policy, claimsRepo);
  return { info, policy, billing, claims, claimQueue, customers, documents, renewals };
}

/**
 * A connector backed by real Postgres storage — the same JSONB-adapter shape
 * as the in-memory one, just durable (see packages/db/migrations/0002_jsonb_adapters.sql).
 * Used when DATABASE_URL is set, so a pilot can run on infra a company
 * actually controls (e.g. India's data-localization requirement) instead of
 * PC Core's own in-memory demo store.
 */
export function buildPostgresConnector(db: Db, numberPrefix = "PC-2026"): Connector {
  return {
    policy: new PostgresPolicyRepository(db, numberPrefix),
    billing: new PostgresBillingRepository(db),
    claims: new PostgresClaimsRepository(db),
    handlers: new PostgresHandlersRepository(db),
    assignmentLog: new PostgresAssignmentLogRepository(db),
    customers: new PostgresCustomerRepository(db),
  };
}

/** Upserts the demo handler roster into Postgres so a fresh database has a usable claim queue. */
async function seedPostgresHandlers(db: Db, handlers: Handler[]): Promise<void> {
  const repo = new PostgresHandlersRepository(db);
  for (const handler of handlers) await repo.save(handler);
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

/** Builds the claimsAi/triageAdvisor/policy-repo trio a self-serve
 * registration needs, from its raw inputs — shared by registerConnector
 * (fresh registration) and hydrate() (rebuilding from durable storage), so
 * the two can never drift into building a tenant differently. */
function buildConnectorTenant(
  policyBaseUrl: string,
  ollama: OllamaClientOptions | undefined,
  policyFieldMapping: PolicyEnvelopeMapping | undefined,
): { connector: Connector; claimsAi?: ClaimsAiProviders; triageAdvisor?: TriageAdvisor } {
  const claimsAi: ClaimsAiProviders | undefined = ollama
    ? {
        extractor: new LlmDocumentExtractor(new OllamaLlmClient(ollama)),
        fraudScorer: new LlmFraudScorer(new OllamaLlmClient(ollama)),
      }
    : undefined;
  const triageAdvisor = ollama
    ? new LlmTriageAdvisor(new OllamaLlmClient(ollama))
    : undefined;
  const policyRepo = policyFieldMapping
    ? new MappedRemoteHttpPolicyRepository(policyBaseUrl, policyFieldMapping)
    : new RemoteHttpPolicyRepository(policyBaseUrl);
  return { connector: { policy: policyRepo }, claimsAi, triageAdvisor };
}

/**
 * Registers one connector per connected company, keyed by both tenant ID and
 * API key, and resolves the matching service bundle per request. Every
 * service is identical code for every tenant — only the connector (where the
 * data actually lives) differs. This is the platform's tenant directory: a
 * company calls `registerConnector` once (see POST /connectors/register) and
 * gets back the key their system authenticates every subsequent call with.
 *
 * An optional `TenantRegistryStore` (see @pc-core/ports) makes self-serve
 * registrations durable — without one, a registered connector only lives in
 * memory and a restart silently forgets it. Seeded platform tenants ("demo",
 * "beta") are never written to the store; they're rebuilt from code/env
 * every boot regardless.
 */
export class TenantRegistry {
  private readonly byTenantId = new Map<string, RegisteredTenant>();
  private readonly byApiKey = new Map<string, RegisteredTenant>();

  constructor(private readonly store?: TenantRegistryStore) {}

  /** Register a tenant with an explicit ID and key — used to seed well-known demo tenants. */
  register(
    info: TenantInfo,
    connector: Connector,
    apiKey: string,
    claimsAi?: ClaimsAiProviders,
    seedHandlers?: Handler[],
    triageAdvisor?: TriageAdvisor,
  ): void {
    const entry: RegisteredTenant = {
      info,
      apiKey,
      services: buildServices(info, connector, claimsAi, seedHandlers, triageAdvisor),
    };
    this.byTenantId.set(info.tenantId, entry);
    this.byApiKey.set(apiKey, entry);
  }

  /**
   * Self-serve onboarding: a company points us at a REST service implementing
   * the policy connector contract (see @pc-core/adapters RemoteHttpPolicyRepository)
   * and gets back a tenant ID + API key. No code changes on PC Core's side.
   *
   * Optionally also points claims-AI's IDP extraction AND fraud scoring, plus
   * the claim queue's advisory triage hint, at a self-hosted Ollama model for
   * this tenant (see @pc-core/claims-ai's OllamaLlmClient / LlmFraudScorer /
   * LlmTriageAdvisor) instead of the default regex extractor and heuristic
   * scorer — PC Core ships no hosted model of its own, so this is how a
   * company brings their own. The triage hint stays advisory only; it never
   * changes the deterministic priority/claimType ClaimQueueService sets.
   *
   * Optionally also takes a human-confirmed PolicyEnvelopeMapping (see
   * @pc-core/schema-mapping and POST /connectors/propose-mapping) for a
   * company whose policy service returns records in its own shape rather
   * than PolicyAggregate directly — MappedRemoteHttpPolicyRepository applies
   * it on every real call instead of the company writing translation code
   * by hand. No mapping reaches here without a person having reviewed it.
   *
   * If a TenantRegistryStore is configured, the registration is persisted
   * before this resolves — so a crash right after registering doesn't lose
   * the tenant the caller just got an API key for.
   */
  async registerConnector(
    name: string,
    policyBaseUrl: string,
    ollama?: OllamaClientOptions,
    policyFieldMapping?: PolicyEnvelopeMapping,
  ): Promise<TenantInfo & { apiKey: string }> {
    const info: TenantInfo = { tenantId: newTenantId(name), name };
    const apiKey = newApiKey();
    const { connector, claimsAi, triageAdvisor } = buildConnectorTenant(
      policyBaseUrl,
      ollama,
      policyFieldMapping,
    );
    this.register(info, connector, apiKey, claimsAi, undefined, triageAdvisor);

    const record: RegisteredConnectorRecord = {
      tenantId: info.tenantId,
      apiKey,
      name,
      policyBaseUrl,
      ollamaModel: ollama?.model,
      ollamaBaseUrl: ollama?.baseUrl,
      policyFieldMapping,
      registeredAt: new Date().toISOString(),
    };
    await this.store?.save(record);

    return { ...info, apiKey };
  }

  /**
   * Rebuilds every self-serve registration from durable storage — call once
   * on boot, after seeding the platform's own tenants, so a restart doesn't
   * forget a pilot insurer's onboarding. A no-op if no store is configured.
   * Returns how many tenants were restored. A persisted mapping is
   * re-validated against the same schema the HTTP layer uses
   * (`policyFieldMappingSchema`) before being trusted — a row that somehow
   * doesn't fit is skipped (logged), not allowed to crash the boot.
   */
  async hydrate(): Promise<number> {
    if (!this.store) return 0;
    const records = await this.store.list();
    let restored = 0;
    for (const record of records) {
      const parsedMapping = record.policyFieldMapping
        ? policyFieldMappingSchema.safeParse(record.policyFieldMapping)
        : undefined;
      if (parsedMapping && !parsedMapping.success) {
        console.error(
          `skipping tenant "${record.tenantId}" on hydrate: stored policyFieldMapping no longer validates`,
        );
        continue;
      }
      const ollama = record.ollamaModel
        ? { model: record.ollamaModel, baseUrl: record.ollamaBaseUrl }
        : undefined;
      const { connector, claimsAi, triageAdvisor } = buildConnectorTenant(
        record.policyBaseUrl,
        ollama,
        parsedMapping?.data as PolicyEnvelopeMapping | undefined,
      );
      this.register(
        { tenantId: record.tenantId, name: record.name },
        connector,
        record.apiKey,
        claimsAi,
        undefined,
        triageAdvisor,
      );
      restored += 1;
    }
    return restored;
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
export const BETA_API_KEY = "pk_beta";

/**
 * Reads LOCAL_LLM_MODEL / LOCAL_LLM_BASE_URL / LOCAL_LLM_API_KEY from the
 * environment. Set only when a company running PC Core on their OWN
 * infrastructure has a local model server up (llama.cpp's llama-server, LM
 * Studio, vLLM, Ollama's OpenAI-compatible endpoint — anything speaking the
 * standard chat-completions shape) and wants their primary tenant's own
 * claims-AI (fraud scoring, IDP extraction) to use it instead of the
 * built-in deterministic defaults. No cloud call, no model shipped by
 * PC Core — see OpenAiCompatibleLlmClient.
 */
function localLlmOptionsFromEnv(): OpenAiCompatibleClientOptions | undefined {
  const model = process.env.LOCAL_LLM_MODEL;
  if (!model) return undefined;
  return {
    model,
    baseUrl: process.env.LOCAL_LLM_BASE_URL,
    apiKey: process.env.LOCAL_LLM_API_KEY,
  };
}

/**
 * The demo registry: a "demo" tenant (Postgres-backed when DATABASE_URL is
 * set, in-memory otherwise), and a "beta" tenant whose policy data lives
 * entirely in a separate process (apps/mock-insurer) reached only over HTTP,
 * with its own different internal schema. Same PolicyService code, genuinely
 * different backends.
 */
export async function buildDemoRegistry(
  betaBaseUrl = process.env.BETA_URL ?? "http://127.0.0.1:4000",
  databaseUrl = process.env.DATABASE_URL,
  localLlm = localLlmOptionsFromEnv(),
): Promise<TenantRegistry> {
  // One connection, reused for both the demo tenant's own Postgres connector
  // (if DATABASE_URL is set) and the tenant registry's durable store — so a
  // self-serve registration survives a restart instead of only living in
  // memory. Without DATABASE_URL, registerConnector still works, it just
  // isn't persisted (same as before this existed).
  const db = databaseUrl ? createDb(databaseUrl).db : undefined;
  const tenantStore = db ? new PostgresTenantRegistryStore(db) : undefined;
  const registry = new TenantRegistry(tenantStore);

  // Demo tenant gets a VAHAN-style vehicle registry wired in, so filing a
  // claim with mismatched vehicle details produces a live
  // VEHICLE_DETAILS_MISMATCH fraud signal (see MockVehicleRegistry's
  // hardcoded plates, e.g. KA01AB1234) — mock only, no real network call.
  // If a local model server is configured (see localLlmOptionsFromEnv), its
  // fraud scoring and IDP extraction run behind that model too — rules stay
  // authoritative either way (see LlmFraudScorer/checkVehicleDetails's
  // fallback-to-deterministic behavior).
  const demoClaimsAi: ClaimsAiProviders = {
    vehicleRegistry: new MockVehicleRegistry(),
    ...(localLlm && {
      extractor: new LlmDocumentExtractor(new OpenAiCompatibleLlmClient(localLlm)),
      fraudScorer: new LlmFraudScorer(new OpenAiCompatibleLlmClient(localLlm)),
    }),
  };
  // Same local model, if configured, also offers an advisory triage hint in
  // the claim queue — see TriageAdvisor's contract: it never overrides the
  // deterministic priority/claimType classifyClaim() sets.
  const demoTriageAdvisor = localLlm
    ? new LlmTriageAdvisor(new OpenAiCompatibleLlmClient(localLlm))
    : undefined;

  if (db) {
    await seedPostgresHandlers(db, DEMO_HANDLERS);
    registry.register(
      { tenantId: "demo", name: "PC Core demo (Postgres)" },
      buildPostgresConnector(db),
      DEMO_API_KEY,
      demoClaimsAi,
      undefined,
      demoTriageAdvisor,
    );
  } else {
    registry.register(
      { tenantId: "demo", name: "PC Core demo (in-memory)" },
      { policy: new InMemoryPolicyRepository("PC-2026") },
      DEMO_API_KEY,
      demoClaimsAi,
      DEMO_HANDLERS,
      demoTriageAdvisor,
    );
  }

  registry.register(
    { tenantId: "beta", name: "Beta Insurance (external system, via HTTP)" },
    { policy: new RemoteHttpPolicyRepository(betaBaseUrl) },
    BETA_API_KEY,
  );

  const restored = await registry.hydrate();
  if (restored > 0) {
    console.log(`  restored ${restored} self-serve connector(s) from storage`);
  }

  return registry;
}
