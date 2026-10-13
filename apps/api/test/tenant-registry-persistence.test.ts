import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryTenantRegistryStore } from "@pc-core/adapters";
import type {
  PolicyAggregate,
  RegisteredConnectorRecord,
  TenantRegistryStore,
} from "@pc-core/ports";
import { TenantRegistry } from "../src/tenants.js";

/** A minimal real external policy server — same shape RemoteHttpPolicyRepository
 * talks to — so a test can exercise an actual quote/bind/issue over HTTP
 * instead of stubbing it away. */
function buildExternalPolicyServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = new Map<string, PolicyAggregate>();
  let seq = 0;

  app.post("/policies", async (req, reply) => {
    const policy = req.body as PolicyAggregate;
    store.set(policy.policyId, policy);
    return reply.status(201).send();
  });
  app.get("/policies/:id", async (req, reply) => {
    const found = store.get((req.params as { id: string }).id);
    return found ?? reply.status(404).send();
  });
  app.put("/policies/:id", async (req) => {
    store.set((req.params as { id: string }).id, req.body as PolicyAggregate);
    return {};
  });
  app.get("/policies", async () => [...store.values()]);
  app.post("/policies/next-number", async () => {
    seq += 1;
    return { policyNumber: `EXT-${String(seq).padStart(5, "0")}` };
  });
  return app;
}

const quotePayload = {
  productCode: "PRIVATE_CAR" as const,
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk: {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  },
};

describe("TenantRegistry — durable self-serve registration", () => {
  let externalServer: FastifyInstance;
  let externalBaseUrl: string;

  beforeAll(async () => {
    externalServer = buildExternalPolicyServer();
    externalBaseUrl = await externalServer.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => externalServer.close());
  afterEach(() => vi.unstubAllGlobals());

  it("without a store, registerConnector works but nothing is persisted (today's behavior, unchanged)", async () => {
    const registry = new TenantRegistry();
    const tenant = await registry.registerConnector("Gamma Insurance", "https://gamma.example.com");
    expect(registry.resolveByApiKey(tenant.apiKey)).toBeDefined();
  });

  it("with a store, registerConnector persists the registration", async () => {
    const store = new InMemoryTenantRegistryStore();
    const registry = new TenantRegistry(store);
    const tenant = await registry.registerConnector("Gamma Insurance", "https://gamma.example.com");

    const saved = await store.list();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.tenantId).toBe(tenant.tenantId);
    expect(saved[0]?.apiKey).toBe(tenant.apiKey);
    expect(saved[0]?.policyBaseUrl).toBe("https://gamma.example.com");
  });

  it("hydrate() rebuilds a resolvable, working tenant from a stored record — simulating a restart", async () => {
    const store = new InMemoryTenantRegistryStore();
    const firstRegistry = new TenantRegistry(store);
    const tenant = await firstRegistry.registerConnector(
      "Gamma Insurance",
      "https://gamma.example.com",
    );

    // Brand-new registry, as if the process restarted — nothing registered yet.
    const secondRegistry = new TenantRegistry(store);
    expect(secondRegistry.resolveByApiKey(tenant.apiKey)).toBeUndefined();

    const restored = await secondRegistry.hydrate();
    expect(restored).toBe(1);
    expect(secondRegistry.resolveByApiKey(tenant.apiKey)).toBeDefined();
    expect(secondRegistry.list()).toEqual([{ tenantId: tenant.tenantId, name: "Gamma Insurance" }]);
  });

  it("hydrate() rebuilds the Ollama-backed claims-AI wiring from a stored ollamaModel", async () => {
    const realFetch = global.fetch;
    const ollamaCalls: string[] = [];
    vi.stubGlobal("fetch", (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/generate")) {
        ollamaCalls.push(String(url));
        return new Response(
          JSON.stringify({ response: '{"score":0.9,"signals":["local model: suspicious"]}' }),
          { status: 200 },
        );
      }
      return realFetch(url, init);
    }) as typeof fetch);

    const store = new InMemoryTenantRegistryStore();
    const firstRegistry = new TenantRegistry(store);
    const tenant = await firstRegistry.registerConnector(
      "Gamma Insurance",
      externalBaseUrl,
      { model: "llama3.1" },
    );

    // Brand-new registry — this is the part that proves hydrate() actually
    // rebuilds the Ollama wiring, not just the connector.
    const secondRegistry = new TenantRegistry(store);
    await secondRegistry.hydrate();
    const services = secondRegistry.resolveByApiKey(tenant.apiKey);
    expect(services).toBeDefined();

    const { policyId } = await services!.policy.quote(quotePayload);
    await services!.policy.bind(policyId);
    await services!.policy.issue(policyId);

    const claim = await services!.claims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
    });

    // The fraud score came from the (stubbed) Ollama call, not the
    // deterministic heuristic — proof the rebuilt tenant really is wired to
    // the stored ollamaModel, not silently falling back to the default.
    expect(claim.fraudScore).toBe(0.9);
    expect(claim.fraudSignals).toContain("local model: suspicious");
    expect(ollamaCalls.length).toBeGreaterThan(0);
  });

  it("hydrate() is a no-op (returns 0) when no store is configured", async () => {
    const registry = new TenantRegistry();
    expect(await registry.hydrate()).toBe(0);
  });

  it("hydrate() skips a record whose stored policyFieldMapping no longer validates, without throwing", async () => {
    const badRecord: RegisteredConnectorRecord = {
      tenantId: "bad-tenant",
      apiKey: "pk_bad",
      name: "Bad Co",
      policyBaseUrl: "https://bad.example.com",
      policyFieldMapping: { fields: { policyId: "id" } }, // missing required keys
      registeredAt: "2026-01-01T00:00:00.000Z",
    };
    const goodRecord: RegisteredConnectorRecord = {
      tenantId: "good-tenant",
      apiKey: "pk_good",
      name: "Good Co",
      policyBaseUrl: "https://good.example.com",
      registeredAt: "2026-01-01T00:00:00.000Z",
    };
    const store: TenantRegistryStore = {
      save: async () => {},
      list: async () => [badRecord, goodRecord],
    };
    const registry = new TenantRegistry(store);

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const restored = await registry.hydrate();
    consoleError.mockRestore();

    expect(restored).toBe(1); // only the good one
    expect(registry.resolveByApiKey("pk_bad")).toBeUndefined();
    expect(registry.resolveByApiKey("pk_good")).toBeDefined();
  });
});
