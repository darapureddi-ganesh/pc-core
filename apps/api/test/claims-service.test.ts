import { describe, it, expect, beforeEach } from "vitest";
import {
  PolicyService,
  type QuoteCommand,
} from "../src/service/policy-service.js";
import {
  InMemoryPolicyRepository,
  InMemoryClaimsRepository,
  MockVehicleRegistry,
} from "@pc-core/adapters";
import { ClaimsService } from "../src/service/claims-service.js";
import type { MotorRisk } from "@pc-core/ports";

const risk: MotorRisk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};
const quoteCmd: QuoteCommand = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk,
};

let policies: PolicyService;
let claims: ClaimsService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  claims = new ClaimsService(new InMemoryClaimsRepository(), policies);
});

async function issued(): Promise<string> {
  const { policyId } = await policies.quote(quoteCmd);
  await policies.bind(policyId);
  await policies.issue(policyId);
  return policyId;
}

describe("claims — anchored to the temporal model", () => {
  it("captures the sum insured in force on the incident date, across an endorsement", async () => {
    const policyId = await issued();
    // Mid-term: raise IDV to 900k effective 2026-06-01
    await policies.endorse({
      policyId,
      effectiveFrom: "2026-06-01",
      change: { op: "setIdv", idv: 900_000 },
    });

    const early = await claims.fnol({
      policyId,
      incidentDate: "2026-03-01",
      cause: "collision",
    });
    expect(early.sumInsured).toBe(600_000); // before the raise

    const late = await claims.fnol({
      policyId,
      incidentDate: "2026-08-01",
      cause: "collision",
    });
    expect(late.sumInsured).toBe(900_000); // after the raise
  });

  it("reserves and settles within the sum insured", async () => {
    const policyId = await issued();
    const claim = await claims.fnol({
      policyId,
      incidentDate: "2026-03-01",
      cause: "theft",
    });
    const reserved = await claims.setReserve({
      claimId: claim.claimId,
      amount: 400_000,
    });
    expect(reserved.status).toBe("RESERVED");

    const settled = await claims.settle({
      claimId: claim.claimId,
      amount: 350_000,
    });
    expect(settled.status).toBe("SETTLED");
    expect(settled.settledAmount).toBe(350_000);
  });

  it("rejects a settlement above the sum insured", async () => {
    const policyId = await issued();
    const claim = await claims.fnol({
      policyId,
      incidentDate: "2026-03-01",
      cause: "fire",
    });
    await expect(
      claims.settle({ claimId: claim.claimId, amount: 700_000 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects FNOL on a policy that is not in force", async () => {
    const { policyId } = await policies.quote(quoteCmd); // quoted, not issued
    await expect(
      claims.fnol({ policyId, incidentDate: "2026-03-01", cause: "x" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("claims-AI — IDP extraction and fraud scoring at FNOL", () => {
  it("extracts fields from raw intake text into the claim record", async () => {
    const policyId = await issued();
    const claim = await claims.fnol({
      policyId,
      incidentDate: "2026-03-01",
      cause: "collision",
      rawIntakeText:
        "Vehicle KA01AB1234 hit on 2026-03-01, repair estimate ₹45,000.",
    });
    expect(claim.extractedFields?.registrationNo).toBe("KA01AB1234");
    expect(claim.extractedFields?.amount).toBe("₹45,000");
  });

  it("scores a claim filed just after policy inception as elevated risk", async () => {
    const policyId = await issued();
    const claim = await claims.fnol({
      policyId,
      incidentDate: "2026-01-05", // 4 days after 2026-01-01 inception
      cause: "collision",
    });
    expect(claim.fraudScore).toBeGreaterThan(0);
    expect(claim.fraudSignals).toContain(
      "incident within 15 days of policy inception",
    );
  });

  it("flags repeat claims on the same policy with a higher score than the first", async () => {
    const policyId = await issued();
    const first = await claims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "theft",
    });
    const second = await claims.fnol({
      policyId,
      incidentDate: "2026-07-01",
      cause: "collision",
    });
    expect(first.fraudScore).toBe(0);
    expect(second.fraudScore).toBeGreaterThan(0);
    expect(second.fraudSignals).toContain(
      "1 prior claim(s) already filed on this policy",
    );
  });
});

describe("claims-AI — optional vehicle-registry (VAHAN-style) check at FNOL", () => {
  const registryRisk: MotorRisk = {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2, registrationNo: "KA01AB1234" },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  };
  const registryQuoteCmd: QuoteCommand = {
    productCode: "PRIVATE_CAR",
    term: { from: "2026-01-01", to: "2027-01-01" },
    risk: registryRisk,
    insured: { name: "A. Sharma" },
  };

  it("adds a VEHICLE_DETAILS_MISMATCH signal when the declared chassis number disagrees with the registry", async () => {
    const registryPolicies = new PolicyService(new InMemoryPolicyRepository());
    const registryClaims = new ClaimsService(
      new InMemoryClaimsRepository(),
      registryPolicies,
      { vehicleRegistry: new MockVehicleRegistry() },
    );
    const { policyId } = await registryPolicies.quote(registryQuoteCmd);
    await registryPolicies.bind(policyId);
    await registryPolicies.issue(policyId);

    const claim = await registryClaims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
      declaredVehicle: { chassisNumber: "SOMETHING-ELSE-ENTIRELY" },
    });

    expect(claim.fraudSignals).toContain(
      "VEHICLE_DETAILS_MISMATCH: declared chassis number does not match the vehicle registry",
    );
    expect(claim.fraudScore).toBeGreaterThan(0);
  });

  it("adds no signal when declared vehicle details match the registry", async () => {
    const registryPolicies = new PolicyService(new InMemoryPolicyRepository());
    const registryClaims = new ClaimsService(
      new InMemoryClaimsRepository(),
      registryPolicies,
      { vehicleRegistry: new MockVehicleRegistry() },
    );
    const { policyId } = await registryPolicies.quote(registryQuoteCmd);
    await registryPolicies.bind(policyId);
    await registryPolicies.issue(policyId);

    const claim = await registryClaims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
      declaredVehicle: { chassisNumber: "MA3ERLF1S00123456" },
    });

    expect(claim.fraudSignals).toEqual([]);
    expect(claim.fraudScore).toBe(0);
  });

  it("falls back to comparing the policy's insured name when no ownerName is declared", async () => {
    const registryPolicies = new PolicyService(new InMemoryPolicyRepository());
    const registryClaims = new ClaimsService(
      new InMemoryClaimsRepository(),
      registryPolicies,
      { vehicleRegistry: new MockVehicleRegistry() },
    );
    const { policyId } = await registryPolicies.quote({
      ...registryQuoteCmd,
      insured: { name: "Totally Different Person" },
    });
    await registryPolicies.bind(policyId);
    await registryPolicies.issue(policyId);

    const claim = await registryClaims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
    });

    expect(claim.fraudSignals).toContain(
      "VEHICLE_DETAILS_MISMATCH: declared owner name does not match the vehicle registry",
    );
  });

  it("skips the check silently when no vehicle registry is configured for the tenant", async () => {
    const registryPolicies = new PolicyService(new InMemoryPolicyRepository());
    const noRegistryClaims = new ClaimsService(
      new InMemoryClaimsRepository(),
      registryPolicies,
    ); // no vehicleRegistry provider
    const { policyId } = await registryPolicies.quote(registryQuoteCmd);
    await registryPolicies.bind(policyId);
    await registryPolicies.issue(policyId);

    const claim = await noRegistryClaims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
      declaredVehicle: { chassisNumber: "SOMETHING-ELSE-ENTIRELY" },
    });

    expect(claim.fraudSignals).toEqual([]);
    expect(claim.fraudScore).toBe(0);
  });

  it("skips the check silently when the registry has no record for the plate", async () => {
    const noRecordPolicies = new PolicyService(new InMemoryPolicyRepository());
    const noRecordClaims = new ClaimsService(
      new InMemoryClaimsRepository(),
      noRecordPolicies,
      { vehicleRegistry: new MockVehicleRegistry() },
    );
    const { policyId } = await noRecordPolicies.quote({
      ...registryQuoteCmd,
      risk: {
        ...registryRisk,
        vehicle: { ...registryRisk.vehicle, registrationNo: "XX99ZZ0000" },
      },
    });
    await noRecordPolicies.bind(policyId);
    await noRecordPolicies.issue(policyId);

    const claim = await noRecordClaims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
      declaredVehicle: { chassisNumber: "ANYTHING" },
    });

    expect(claim.fraudSignals).toEqual([]);
  });
});
