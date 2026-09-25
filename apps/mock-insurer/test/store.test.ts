import { describe, it, expect } from "vitest";
import { toBeta, toContract } from "../src/store.js";
import type { PolicyAggregate } from "@pc-core/ports";

const risk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};

const policy: PolicyAggregate = {
  policyId: "p-1",
  policyNumber: "BETA-00001",
  productCode: "PRIVATE_CAR",
  productVersion: "2026.1",
  status: "ISSUED",
  term: { from: "2026-01-01", to: "2027-01-01" },
  base: risk,
  baseRecordedAt: "2026-01-01T00:00:00.000Z",
  transactions: [
    {
      txnType: "ENDORSE",
      effectiveFrom: "2026-06-01",
      recordedAt: "2026-06-01T00:00:00.000Z",
      change: { op: "setIdv", idv: 900_000 },
    },
  ],
  insured: { name: "A. Sharma" },
  customerId: "cust-1",
  renewedFromPolicyId: "p-0",
  cancelledEffectiveFrom: undefined,
};

describe("Beta's own toContract/toBeta translation — round-trips every PolicyAggregate field", () => {
  it("toBeta -> toContract reproduces the original policy, including customerId and renewedFromPolicyId", () => {
    const roundTripped = toContract(toBeta(policy));
    expect(roundTripped).toEqual(policy);
  });

  it("toBeta encodes status/risk/change as Beta's own lower-case/JSON-blob shape", () => {
    const record = toBeta(policy);
    expect(record.state).toBe("issued");
    expect(JSON.parse(record.riskBlob)).toEqual(risk);
    expect(record.custId).toBe("cust-1");
    expect(record.renewedFromId).toBe("p-0");
  });
});
