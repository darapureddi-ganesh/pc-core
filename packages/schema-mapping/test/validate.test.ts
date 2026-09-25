import { describe, it, expect } from "vitest";
import { validateMappedPolicy } from "../src/index.js";

const validPolicy = {
  policyId: "p1",
  policyNumber: "PC-1",
  productCode: "PRIVATE_CAR",
  productVersion: "2026.1",
  status: "ISSUED",
  term: { from: "2026-01-01", to: "2027-01-01" },
  base: { vehicle: {} },
  baseRecordedAt: "2026-01-01T00:00:00.000Z",
  transactions: [
    { txnType: "ENDORSE", effectiveFrom: "2026-06-01", recordedAt: "2026-06-01T00:00:00.000Z", change: { op: "setIdv", idv: 1 } },
  ],
};

describe("validateMappedPolicy", () => {
  it("accepts a well-formed candidate", () => {
    expect(validateMappedPolicy(validPolicy)).toEqual({ valid: true, errors: [] });
  });

  it("rejects a non-object", () => {
    expect(validateMappedPolicy(null).valid).toBe(false);
    expect(validateMappedPolicy("nope").valid).toBe(false);
  });

  it("rejects an invalid status value", () => {
    const result = validateMappedPolicy({ ...validPolicy, status: "WEIRD" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("status"))).toBe(true);
  });

  it("rejects a base that's still a JSON string instead of an object", () => {
    const result = validateMappedPolicy({ ...validPolicy, base: JSON.stringify({ vehicle: {} }) });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("base"))).toBe(true);
  });

  it("rejects a transaction whose change is still a JSON string", () => {
    const result = validateMappedPolicy({
      ...validPolicy,
      transactions: [{ ...validPolicy.transactions[0], change: '{"op":"setIdv","idv":1}' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("change"))).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const result = validateMappedPolicy({ policyId: "", status: "BAD" });
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("rejects an array in place of base — typeof [] is \"object\" too", () => {
    const result = validateMappedPolicy({ ...validPolicy, base: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("base"))).toBe(true);
  });

  it("rejects an array in place of a transaction's change", () => {
    const result = validateMappedPolicy({
      ...validPolicy,
      transactions: [{ ...validPolicy.transactions[0], change: [] }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("change"))).toBe(true);
  });

  it("returns invalid (never throws) for null/undefined transaction items", () => {
    expect(() =>
      validateMappedPolicy({ ...validPolicy, transactions: [null, undefined] }),
    ).not.toThrow();
    const result = validateMappedPolicy({ ...validPolicy, transactions: [null, undefined] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
