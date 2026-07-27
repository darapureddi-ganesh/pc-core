import { describe, it, expect } from "vitest";
import { buildServer } from "../src/http/server.js";
import { PolicyService } from "../src/service/policy-service.js";
import { InMemoryPolicyRepository } from "../src/service/repository.js";
import { BillingService } from "../src/service/billing-service.js";
import { InMemoryBillingRepository } from "../src/service/billing-repository.js";
import { ClaimsService } from "../src/service/claims-service.js";
import { InMemoryClaimsRepository } from "../src/service/claims-repository.js";
import { DocumentService } from "../src/service/document-service.js";

const newApp = () => {
  const policy = new PolicyService(new InMemoryPolicyRepository());
  const billing = new BillingService(new InMemoryBillingRepository());
  const claims = new ClaimsService(new InMemoryClaimsRepository(), policy);
  const documents = new DocumentService(policy);
  return buildServer({ policy, billing, claims, documents });
};

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

async function issuePolicy(app: ReturnType<typeof newApp>): Promise<string> {
  const { policyId } = (
    await app.inject({ method: "POST", url: "/quotes", payload: quotePayload })
  ).json();
  await app.inject({ method: "POST", url: `/policies/${policyId}/bind` });
  await app.inject({ method: "POST", url: `/policies/${policyId}/issue` });
  return policyId;
}

describe("HTTP API", () => {
  it("quotes then binds then issues over HTTP", async () => {
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
