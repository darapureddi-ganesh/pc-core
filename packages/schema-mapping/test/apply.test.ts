import { describe, it, expect } from "vitest";
import { applyPolicyEnvelopeMapping, unapplyPolicyEnvelopeMapping } from "../src/index.js";
import type { PolicyEnvelopeMapping } from "../src/index.js";
import type { PolicyAggregate } from "@pc-core/ports";

/**
 * The mapping needed to describe "Beta Insurance"'s real record shape
 * (apps/mock-insurer/src/store.ts's BetaRecord) — the same translation its
 * hand-written toContract/toBeta functions perform, expressed as data. If
 * this mapping can reproduce what that hand-written code does, the engine
 * is solving a genuine, representative integration problem, not a toy one.
 */
const betaMapping: PolicyEnvelopeMapping = {
  fields: {
    policyId: "id",
    policyNumber: "number",
    productCode: "productCd",
    productVersion: "productRev",
    status: "state",
    termFrom: "startDt",
    termTo: "endDt",
    base: "riskBlob",
    baseRecordedAt: "loggedAt",
    transactions: "txns",
    insuredName: "insuredNm",
    cancelledEffectiveFrom: "cancelDt",
  },
  statusValues: { quoted: "QUOTED", bound: "BOUND", issued: "ISSUED", cancelled: "CANCELLED" },
  baseIsJsonEncoded: true,
  transactionFields: {
    txnType: "kind",
    effectiveFrom: "effDt",
    recordedAt: "loggedAt",
    change: "deltaBlob",
  },
  transactionChangeIsJsonEncoded: true,
};

const risk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};

const betaRecord = {
  id: "pol-1",
  number: "BETA-000001",
  productCd: "PRIVATE_CAR",
  productRev: "2026.1",
  state: "issued" as const,
  startDt: "2026-01-01",
  endDt: "2027-01-01",
  insuredNm: "A. Sharma",
  riskBlob: JSON.stringify(risk),
  loggedAt: "2026-01-01T00:00:00.000Z",
  txns: [
    {
      kind: "ENDORSE" as const,
      effDt: "2026-06-01",
      loggedAt: "2026-06-01T00:00:00.000Z",
      deltaBlob: JSON.stringify({ op: "setIdv", idv: 900_000 }),
    },
  ],
};

describe("applyPolicyEnvelopeMapping — reproduces the hand-written Beta adapter", () => {
  it("maps a Beta-shaped record onto a valid PolicyAggregate", () => {
    const policy = applyPolicyEnvelopeMapping(betaRecord, betaMapping);
    expect(policy).toEqual<PolicyAggregate>({
      policyId: "pol-1",
      policyNumber: "BETA-000001",
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
      cancelledEffectiveFrom: undefined,
    });
  });

  it("throws a clear error when the status value has no mapping entry", () => {
    expect(() =>
      applyPolicyEnvelopeMapping({ ...betaRecord, state: "unknown" }, betaMapping),
    ).toThrow(/status value/);
  });

  it("throws a clear error when a field marked JSON-encoded isn't a string", () => {
    expect(() =>
      applyPolicyEnvelopeMapping({ ...betaRecord, riskBlob: { already: "an object" } }, betaMapping),
    ).toThrow(/JSON-encoded/);
  });

  it("rejects an inherited-property status value like \"toString\"", () => {
    // { state: "toString" } — plain `in` would match Object.prototype.toString
    // even though it's not a real entry in statusValues.
    expect(() =>
      applyPolicyEnvelopeMapping({ ...betaRecord, state: "toString" }, betaMapping),
    ).toThrow(/status value/);
  });

  it("round-trips a customerId when the mapping declares it", () => {
    const mappingWithCustomerId = {
      ...betaMapping,
      fields: { ...betaMapping.fields, customerId: "custId" },
    };
    const policy = applyPolicyEnvelopeMapping(
      { ...betaRecord, custId: "cust-42" },
      mappingWithCustomerId,
    );
    expect(policy.customerId).toBe("cust-42");
    const roundTripped = unapplyPolicyEnvelopeMapping(policy, mappingWithCustomerId);
    expect((roundTripped as Record<string, unknown>).custId).toBe("cust-42");
  });

  it("round-trips a renewedFromPolicyId when the mapping declares it", () => {
    const mappingWithRenewal = {
      ...betaMapping,
      fields: { ...betaMapping.fields, renewedFromPolicyId: "renewedFromId" },
    };
    const policy = applyPolicyEnvelopeMapping(
      { ...betaRecord, renewedFromId: "pol-0" },
      mappingWithRenewal,
    );
    expect(policy.renewedFromPolicyId).toBe("pol-0");
    const roundTripped = unapplyPolicyEnvelopeMapping(policy, mappingWithRenewal);
    expect((roundTripped as Record<string, unknown>).renewedFromId).toBe("pol-0");
  });

  it("round-trips through unapply back to the original shape", () => {
    const policy = applyPolicyEnvelopeMapping(betaRecord, betaMapping);
    const roundTripped = unapplyPolicyEnvelopeMapping(policy, betaMapping);
    expect(roundTripped).toEqual({
      id: "pol-1",
      number: "BETA-000001",
      productCd: "PRIVATE_CAR",
      productRev: "2026.1",
      state: "issued",
      startDt: "2026-01-01",
      endDt: "2027-01-01",
      riskBlob: JSON.stringify(risk),
      loggedAt: "2026-01-01T00:00:00.000Z",
      txns: [
        {
          kind: "ENDORSE",
          effDt: "2026-06-01",
          loggedAt: "2026-06-01T00:00:00.000Z",
          deltaBlob: JSON.stringify({ op: "setIdv", idv: 900_000 }),
        },
      ],
      insuredNm: "A. Sharma",
    });
  });
});
