import { describe, it, expect } from "vitest";
import { InMemoryPolicyRepository } from "@pc-core/adapters";
import { buildServer } from "../src/http/server.js";
import { TenantRegistry } from "../src/tenants.js";

const newRegistry = () => {
  const registry = new TenantRegistry();
  registry.register(
    { tenantId: "demo", name: "pc-core demo" },
    { policy: new InMemoryPolicyRepository() },
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

describe("multi-tenancy — the same API, routed to different connectors", () => {
  it("isolates data between two tenants sharing one running API", async () => {
    const registry = newRegistry();
    registry.register(
      { tenantId: "other", name: "Other Co" },
      { policy: new InMemoryPolicyRepository("OTHER") },
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
    expect(res.json()).toEqual([{ tenantId: "demo", name: "pc-core demo" }]);

    await app.close();
  });
});
