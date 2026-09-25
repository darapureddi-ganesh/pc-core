import { describe, it, expect } from "vitest";
import { dryRunMapping } from "../src/index.js";
import type { PolicyEnvelopeMapping } from "../src/index.js";

const risk = { vehicle: {} };
const mapping: PolicyEnvelopeMapping = {
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
  },
  statusValues: { issued: "ISSUED" },
  baseIsJsonEncoded: true,
  transactionFields: { txnType: "kind", effectiveFrom: "effDt", recordedAt: "loggedAt", change: "deltaBlob" },
  transactionChangeIsJsonEncoded: true,
};

const goodRecord = {
  id: "p1",
  number: "N-1",
  productCd: "PRIVATE_CAR",
  productRev: "2026.1",
  state: "issued",
  startDt: "2026-01-01",
  endDt: "2027-01-01",
  riskBlob: JSON.stringify(risk),
  loggedAt: "2026-01-01T00:00:00.000Z",
  txns: [],
};

describe("dryRunMapping", () => {
  it("is valid when every sample maps and validates cleanly", () => {
    const result = dryRunMapping([goodRecord, { ...goodRecord, id: "p2" }], mapping);
    expect(result.valid).toBe(true);
    expect(result.samples).toHaveLength(2);
    expect(result.samples[0]?.errors).toEqual([]);
    expect(result.samples[0]?.mapped?.policyId).toBe("p1");
  });

  it("is invalid if any single sample fails to map", () => {
    const badRecord = { ...goodRecord, state: "not-a-known-status" };
    const result = dryRunMapping([goodRecord, badRecord], mapping);
    expect(result.valid).toBe(false);
    expect(result.samples[1]?.errors.length).toBeGreaterThan(0);
    // the good sample still mapped fine — failures are per-sample, not all-or-nothing
    expect(result.samples[0]?.errors).toEqual([]);
  });

  it("is invalid with zero samples", () => {
    expect(dryRunMapping([], mapping).valid).toBe(false);
  });
});
