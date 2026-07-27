import { describe, it, expect, beforeEach } from "vitest";
import {
  PolicyService,
  PolicyError,
  type QuoteCommand,
} from "../src/service/policy-service.js";
import { InMemoryPolicyRepository } from "../src/service/repository.js";
import type { MotorRisk } from "../src/service/types.js";

const risk: MotorRisk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: ["ZERO_DEP"],
  coverages: { tpSelected: true },
};

const quoteCmd: QuoteCommand = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk,
};

let service: PolicyService;
beforeEach(() => {
  service = new PolicyService(new InMemoryPolicyRepository());
});

describe("policy lifecycle", () => {
  it("quote -> bind -> issue prices from the product and assigns a number", async () => {
    const { policyId, rating } = await service.quote(quoteCmd);
    expect(rating.total).toBeCloseTo(21642.38, 2);

    await service.bind(policyId);
    const issued = await service.issue(policyId);

    expect(issued.status).toBe("ISSUED");
    expect(issued.policyNumber).toMatch(/^PC-2026-\d{6}$/);
  });

  it("rejects illegal state transitions with a CONFLICT", async () => {
    const { policyId } = await service.quote(quoteCmd);
    // cannot issue before bind
    await expect(service.issue(policyId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(service.issue(policyId)).rejects.toBeInstanceOf(PolicyError);
  });

  it("re-rates a mid-term endorsement and reconstructs as-of any date", async () => {
    const { policyId } = await service.quote(quoteCmd);
    await service.bind(policyId);
    await service.issue(policyId);

    // Raise IDV to 700k effective 2026-04-01
    const snapshot = await service.endorse({
      policyId,
      effectiveFrom: "2026-04-01",
      change: { op: "setIdv", idv: 700_000 },
    });
    expect(snapshot.risk.vehicle.idv).toBe(700_000);
    expect(snapshot.rating.breakdown.odBase).toBe(21_000); // 0.030 * 700000

    // Before the endorsement: original IDV and premium
    const before = await service.getAsOf(policyId, "2026-02-01");
    expect(before?.risk.vehicle.idv).toBe(600_000);
    expect(before?.rating.total).toBeCloseTo(21642.38, 2);

    // After: the re-rated risk
    const after = await service.getAsOf(policyId, "2026-06-01");
    expect(after?.risk.vehicle.idv).toBe(700_000);
  });

  it("composes a backdated endorsement across a later one", async () => {
    const { policyId } = await service.quote(quoteCmd);
    await service.bind(policyId);
    await service.issue(policyId);

    // A later-effective endorsement, recorded first
    await service.endorse({
      policyId,
      effectiveFrom: "2026-07-01",
      change: { op: "addAddOn", code: "RSA" },
      recordedAt: "2026-06-15T00:00:00Z",
    });
    // Then a BACKDATED endorsement — recorded later, effective earlier
    await service.endorse({
      policyId,
      effectiveFrom: "2026-03-01",
      change: { op: "setNcb", ncb: 50 },
      recordedAt: "2026-08-01T00:00:00Z",
    });

    // Late in the year both changes are in force
    const now = await service.getAsOf(policyId, "2026-08-01");
    expect(now?.risk.policy.ncb).toBe(50);
    expect(now?.risk.selectedAddOns).toContain("RSA");

    // Between the backdate and the add-on, only the NCB change applies
    const spring = await service.getAsOf(policyId, "2026-05-01");
    expect(spring?.risk.policy.ncb).toBe(50);
    expect(spring?.risk.selectedAddOns).not.toContain("RSA");
  });

  it("rejects an endorsement outside the policy term", async () => {
    const { policyId } = await service.quote(quoteCmd);
    await service.bind(policyId);
    await service.issue(policyId);

    await expect(
      service.endorse({
        policyId,
        effectiveFrom: "2028-01-01",
        change: { op: "setNcb", ncb: 50 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reports no in-force coverage on or after the cancellation date", async () => {
    const { policyId } = await service.quote(quoteCmd);
    await service.bind(policyId);
    await service.issue(policyId);

    // Cancel effective 2026-06-01 (T)
    await service.cancel({ policyId, effectiveFrom: "2026-06-01" });

    // T+1day: no coverage in force
    expect(await service.getAsOf(policyId, "2026-06-02")).toBeUndefined();
    // On the cancellation date itself coverage has already ceased (half-open)
    expect(await service.getAsOf(policyId, "2026-06-01")).toBeUndefined();
    // Before cancellation the policy still reconstructs as in force
    const before = await service.getAsOf(policyId, "2026-05-31");
    expect(before?.risk.vehicle.idv).toBe(600_000);
  });
});
