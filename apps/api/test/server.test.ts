import { describe, it, expect } from "vitest";
import { buildServer } from "../src/http/server.js";
import { PolicyService } from "../src/service/policy-service.js";
import { InMemoryPolicyRepository } from "../src/service/repository.js";

const newApp = () =>
  buildServer(new PolicyService(new InMemoryPolicyRepository()));

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

  it("endorses and reads back the re-rated slice as-of a date", async () => {
    const app = newApp();
    const { policyId } = (
      await app.inject({ method: "POST", url: "/quotes", payload: quotePayload })
    ).json();
    await app.inject({ method: "POST", url: `/policies/${policyId}/bind` });
    await app.inject({ method: "POST", url: `/policies/${policyId}/issue` });

    await app.inject({
      method: "POST",
      url: `/policies/${policyId}/endorsements`,
      payload: {
        effectiveFrom: "2026-04-01",
        change: { op: "setIdv", idv: 700_000 },
      },
    });

    const asOfRes = await app.inject({
      method: "GET",
      url: `/policies/${policyId}?asOf=2026-06-01`,
    });
    expect(asOfRes.statusCode).toBe(200);
    expect(asOfRes.json().risk.vehicle.idv).toBe(700_000);

    await app.close();
  });

  it("returns 409 on an illegal transition", async () => {
    const app = newApp();
    const { policyId } = (
      await app.inject({ method: "POST", url: "/quotes", payload: quotePayload })
    ).json();

    // issue before bind
    const issueRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/issue`,
    });
    expect(issueRes.statusCode).toBe(409);

    await app.close();
  });
});
