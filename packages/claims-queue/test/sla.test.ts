import { describe, it, expect } from "vitest";
import { computeSla } from "../src/index.js";

describe("computeSla — TAT windows by priority", () => {
  it("is not breached and low-risk right after the incident", () => {
    const result = computeSla("2026-01-01", "MEDIUM", new Date("2026-01-02T00:00:00Z"));
    expect(result.slaBreached).toBe(false);
    expect(result.slaDeadline).toBe("2026-01-31");
    expect(result.slaRiskScore).toBeCloseTo(1 / 30, 5);
  });

  it("breaches once the TAT window for the priority elapses", () => {
    const result = computeSla("2026-01-01", "CRITICAL", new Date("2026-01-10T00:00:00Z"));
    expect(result.slaBreached).toBe(true); // 9 days elapsed vs 7-day CRITICAL TAT
  });

  it("clamps risk score at 1 for very overdue claims", () => {
    const result = computeSla("2026-01-01", "LOW", new Date("2027-01-01T00:00:00Z"));
    expect(result.slaRiskScore).toBe(1);
  });

  it("throws a clear error instead of producing an invalid deadline for a bad date", () => {
    expect(() => computeSla("not-a-date", "LOW")).toThrow(/invalid incidentDate/);
  });
});
