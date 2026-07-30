import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryPolicyRepository } from "@pc-core/adapters";
import type { PolicyAggregate } from "@pc-core/ports";
import { buildServer } from "../src/http/server.js";
import { TenantRegistry } from "../src/tenants.js";

const DEMO_KEY = "pk_test_demo";

const newRegistry = () => {
  const registry = new TenantRegistry();
  registry.register(
    { tenantId: "demo", name: "OpenCover demo" },
    { policy: new InMemoryPolicyRepository() },
    DEMO_KEY,
  );
  return registry;
};

const newApp = () => buildServer(newRegistry());

const quotePayload = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk: {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: ["ZERO_DEP"],
    coverages: { tpSelected: true },
  },
};

async function issuePolicy(
  app: ReturnType<typeof newApp>,
  tenantId = "demo",
): Promise<string> {
  const { policyId } = (
    await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: { "x-tenant-id": tenantId },
    })
  ).json();
  await app.inject({
    method: "POST",
    url: `/policies/${policyId}/bind`,
    headers: { "x-tenant-id": tenantId },
  });
  await app.inject({
    method: "POST",
    url: `/policies/${policyId}/issue`,
    headers: { "x-tenant-id": tenantId },
  });
  return policyId;
}

describe("HTTP API", () => {
  it("quotes then binds then issues over HTTP, defaulting to the demo tenant", async () => {
    const app = newApp();
    const quoteRes = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
    });
    expect(quoteRes.statusCode).toBe(201);
    const { policyId, rating } = quoteRes.json();
    expect(rating.total).toBeCloseTo(21642.38, 2);

    await app.inject({ method: "POST", url: `/policies/${policyId}/bind` });
    const issueRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/issue`,
    });
    expect(issueRes.statusCode).toBe(200);
    expect(issueRes.json().policyNumber).toMatch(/^PC-2026-\d{6}$/);

    await app.close();
  });

  it("auto-invoices on issue and records a payment", async () => {
    const app = newApp();
    const policyId = await issuePolicy(app);

    const before = (
      await app.inject({ method: "GET", url: `/policies/${policyId}/billing` })
    ).json();
    expect(before.total).toBeCloseTo(21642.38, 2);
    expect(before.outstanding).toBeCloseTo(21642.38, 2);

    const payRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/payments`,
      payload: { amount: 21642.38, date: "2026-01-05" },
    });
    expect(payRes.statusCode).toBe(200);
    expect(payRes.json().outstanding).toBe(0);

    await app.close();
  });

  it("files a claim (FNOL) and returns the cover in force", async () => {
    const app = newApp();
    const policyId = await issuePolicy(app);

    const claimRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/claims`,
      payload: { incidentDate: "2026-03-01", cause: "collision" },
    });
    expect(claimRes.statusCode).toBe(201);
    expect(claimRes.json().sumInsured).toBe(600_000);

    await app.close();
  });

  it("renders the policy schedule and the premium register after issue", async () => {
    const app = newApp();
    const policyId = await issuePolicy(app);

    const schedule = await app.inject({
      method: "GET",
      url: `/policies/${policyId}/documents/schedule`,
    });
    expect(schedule.statusCode).toBe(200);
    expect(schedule.headers["content-type"]).toContain("text/html");
    expect(schedule.body).toContain("PC-2026-000001");
    expect(schedule.body).toContain("₹21,642.38");

    const register = await app.inject({
      method: "GET",
      url: "/reports/premium-register",
    });
    expect(register.statusCode).toBe(200);
    expect(register.headers["content-type"]).toContain("text/csv");
    expect(register.body).toContain("PC-2026-000001");

    await app.close();
  });

  it("rejects a claim override with an empty reason or reviewer identity", async () => {
    const app = newApp();
    const policyId = await issuePolicy(app);
    const claimRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/claims`,
      payload: { incidentDate: "2026-03-01", cause: "collision" },
    });
    const { claimId } = claimRes.json();

    const res = await app.inject({
      method: "POST",
      url: `/claims/${claimId}/override`,
      payload: { handlerId: "h-1", reason: "", overrideBy: "" },
    });
    expect(res.statusCode).toBe(400);

    await app.close();
  });

  it("returns 409 on an illegal transition", async () => {
    const app = newApp();
    const { policyId } = (
      await app.inject({ method: "POST", url: "/quotes", payload: quotePayload })
    ).json();
    const issueRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/issue`,
    });
    expect(issueRes.statusCode).toBe(409);

    await app.close();
  });
});

describe("customers — the identity tying policies + claims together", () => {
  it("registers a customer, links a quote to them, and returns their history", async () => {
    const app = newApp();

    const registerRes = await app.inject({
      method: "POST",
      url: "/customers",
      payload: { name: "A. Sharma", email: "a.sharma@example.com" },
    });
    expect(registerRes.statusCode).toBe(201);
    const { customerId } = registerRes.json();

    const quoteRes = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: { ...quotePayload, customerId },
    });
    const { policyId } = quoteRes.json();
    await app.inject({ method: "POST", url: `/policies/${policyId}/bind` });
    await app.inject({ method: "POST", url: `/policies/${policyId}/issue` });

    const historyRes = await app.inject({
      method: "GET",
      url: `/customers/${customerId}/history`,
    });
    expect(historyRes.statusCode).toBe(200);
    const history = historyRes.json();
    expect(history.customer.name).toBe("A. Sharma");
    expect(history.policies.map((p: { policyId: string }) => p.policyId)).toEqual([
      policyId,
    ]);

    await app.close();
  });

  it("returns 404 for an unknown customer", async () => {
    const app = newApp();
    const res = await app.inject({ method: "GET", url: "/customers/missing" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("multi-tenancy — the same API, routed to different connectors", () => {
  it("isolates data between two tenants sharing one running API", async () => {
    const registry = newRegistry();
    registry.register(
      { tenantId: "other", name: "Other Co" },
      { policy: new InMemoryPolicyRepository("OTHER") },
      "pk_test_other",
    );
    const app = buildServer(registry);

    const demoPolicyId = await issuePolicy(app, "demo");
    const otherPolicyId = await issuePolicy(app, "other");

    // The demo tenant's request cannot see the other tenant's policy, and vice versa.
    const demoSeesOther = await app.inject({
      method: "GET",
      url: `/policies/${otherPolicyId}`,
      headers: { "x-tenant-id": "demo" },
    });
    expect(demoSeesOther.statusCode).toBe(404);

    const otherSeesDemo = await app.inject({
      method: "GET",
      url: `/policies/${demoPolicyId}`,
      headers: { "x-tenant-id": "other" },
    });
    expect(otherSeesDemo.statusCode).toBe(404);

    // Each tenant's own connector still numbers policies its own way.
    const demoPolicy = (
      await app.inject({
        method: "GET",
        url: `/policies/${demoPolicyId}`,
        headers: { "x-tenant-id": "demo" },
      })
    ).json();
    const otherPolicy = (
      await app.inject({
        method: "GET",
        url: `/policies/${otherPolicyId}`,
        headers: { "x-tenant-id": "other" },
      })
    ).json();
    expect(demoPolicy.policyNumber).toMatch(/^PC-2026-/);
    expect(otherPolicy.policyNumber).toMatch(/^OTHER-/);

    await app.close();
  });

  it("returns 404 for an unregistered tenant", async () => {
    const app = newApp();
    const res = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: { "x-tenant-id": "nonexistent" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("NOT_FOUND");

    await app.close();
  });

  it("lists registered tenants", async () => {
    const app = newApp();
    const res = await app.inject({ method: "GET", url: "/tenants" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([{ tenantId: "demo", name: "OpenCover demo" }]);

    await app.close();
  });
});

/** A minimal external policy store satisfying the connector contract, standing
 * in for a company's own system during self-serve onboarding. */
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

describe("self-serve connector onboarding + API-key auth", () => {
  let externalServer: FastifyInstance;
  let externalBaseUrl: string;

  beforeAll(async () => {
    externalServer = buildExternalPolicyServer();
    externalBaseUrl = await externalServer.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => externalServer.close());

  it("registers a new connector and immediately runs the full lifecycle through it", async () => {
    const app = newApp();

    const reg = await app.inject({
      method: "POST",
      url: "/connectors/register",
      payload: { name: "External Co", policyBaseUrl: externalBaseUrl },
    });
    expect(reg.statusCode).toBe(201);
    const { tenantId, apiKey } = reg.json();
    expect(tenantId).toMatch(/^external-co-/);
    expect(apiKey).toMatch(/^pk_/);

    // The new tenant is immediately visible and usable, authenticated by its key.
    const tenants = (await app.inject({ method: "GET", url: "/tenants" })).json();
    expect(tenants.map((t: { tenantId: string }) => t.tenantId)).toContain(tenantId);

    const auth = { authorization: `Bearer ${apiKey}` };
    const quoteRes = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: auth,
    });
    expect(quoteRes.statusCode).toBe(201);
    const { policyId } = quoteRes.json();

    await app.inject({ method: "POST", url: `/policies/${policyId}/bind`, headers: auth });
    const issueRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/issue`,
      headers: auth,
    });
    expect(issueRes.statusCode).toBe(200);
    expect(issueRes.json().policyNumber).toBe("EXT-00001");

    await app.close();
  });

  it("rejects an unknown API key", async () => {
    const app = newApp();
    const res = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: { authorization: "Bearer pk_not_a_real_key" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("prefers a valid API key over the X-Tenant-Id fallback", async () => {
    const app = newApp();
    const res = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: { authorization: `Bearer ${DEMO_KEY}`, "x-tenant-id": "nonexistent" },
    });
    // The key resolves the real "demo" tenant even though the header says otherwise.
    expect(res.statusCode).toBe(201);
    await app.close();
  });
});
