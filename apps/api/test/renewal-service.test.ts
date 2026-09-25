import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryClaimsRepository, InMemoryPolicyRepository } from "@pc-core/adapters";
import type { MotorRisk } from "@pc-core/ports";
import { PolicyService, type QuoteCommand } from "../src/service/policy-service.js";
import { ClaimsService } from "../src/service/claims-service.js";
import { RenewalService } from "../src/service/renewal-service.js";

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
  insured: { name: "A. Sharma" },
  customerId: "cust-1",
};

let policies: PolicyService;
let claimsRepo: InMemoryClaimsRepository;
let claims: ClaimsService;
let renewals: RenewalService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  claimsRepo = new InMemoryClaimsRepository();
  claims = new ClaimsService(claimsRepo, policies);
  renewals = new RenewalService(policies, claimsRepo);
});

async function issued(): Promise<string> {
  const { policyId } = await policies.quote(quoteCmd);
  await policies.bind(policyId);
  await policies.issue(policyId);
  return policyId;
}

describe("RenewalService — quoteRenewal", () => {
  it("steps up NCB, rolls the term a year, increments vehicle age, and carries insured/customerId forward when claim-free", async () => {
    const policyId = await issued();
    const result = await renewals.quoteRenewal(policyId);

    expect(result.previousPolicyId).toBe(policyId);
    expect(result.term).toEqual({ from: "2027-01-01", to: "2028-01-01" });
    expect(result.ncb).toEqual({ previous: 25, renewed: 35, hadClaimInTerm: false });

    const renewalPolicy = await policies.get(result.renewalPolicyId);
    expect(renewalPolicy.status).toBe("QUOTED");
    expect(renewalPolicy.renewedFromPolicyId).toBe(policyId);
    expect(renewalPolicy.base.vehicle.age).toBe(3); // 2 -> 3
    expect(renewalPolicy.base.policy.ncb).toBe(35);
    expect(renewalPolicy.insured).toEqual({ name: "A. Sharma" });
    expect(renewalPolicy.customerId).toBe("cust-1");
  });

  it("resets NCB to 0 when a claim was filed during the expiring term", async () => {
    const policyId = await issued();
    await claims.fnol({ policyId, incidentDate: "2026-06-01", cause: "collision" });

    const result = await renewals.quoteRenewal(policyId);
    expect(result.ncb).toEqual({ previous: 25, renewed: 0, hadClaimInTerm: true });
  });

  it("the renewal quote goes through the ordinary bind -> issue lifecycle", async () => {
    const policyId = await issued();
    const { renewalPolicyId } = await renewals.quoteRenewal(policyId);

    await policies.bind(renewalPolicyId);
    const renewalIssued = await policies.issue(renewalPolicyId);
    expect(renewalIssued.status).toBe("ISSUED");
    expect(renewalIssued.policyNumber).not.toBeNull();
    // a distinct policy record from the one it renews
    expect(renewalIssued.policyId).not.toBe(policyId);
  });

  it("rejects renewing a policy that isn't issued yet", async () => {
    const { policyId } = await policies.quote(quoteCmd); // quoted, not issued
    await expect(renewals.quoteRenewal(policyId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects renewing an already-cancelled policy", async () => {
    const policyId = await issued();
    await policies.cancel({ policyId, effectiveFrom: "2026-06-01" });
    await expect(renewals.quoteRenewal(policyId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});
