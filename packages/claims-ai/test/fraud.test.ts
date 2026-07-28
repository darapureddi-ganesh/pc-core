import { describe, it, expect } from "vitest";
import { scoreFraudRisk } from "../src/index.js";

describe("scoreFraudRisk — v1 heuristics", () => {
  it("scores a clean, isolated, mid-term claim as low risk", () => {
    const result = scoreFraudRisk({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 120,
    });
    expect(result.score).toBe(0);
    expect(result.signals).toHaveLength(0);
  });

  it("flags a claim filed very soon after policy inception", () => {
    const result = scoreFraudRisk({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 5,
    });
    expect(result.score).toBeCloseTo(0.3, 5);
    expect(result.signals).toContain(
      "incident within 15 days of policy inception",
    );
  });

  it("flags repeat claims on the same policy, capped at 3", () => {
    const result = scoreFraudRisk({
      priorClaimsOnPolicy: 5,
      daysSincePolicyStart: 200,
    });
    expect(result.score).toBeCloseTo(0.75, 5); // 0.25 * min(5,3)
    expect(result.signals).toContain(
      "5 prior claim(s) already filed on this policy",
    );
  });

  it("treats a pre-inception incident date as a strong red flag", () => {
    const result = scoreFraudRisk({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: -3,
    });
    expect(result.score).toBeCloseTo(0.4, 5);
    expect(result.signals).toContain("incident date precedes policy inception");
  });

  it("clamps the combined score at 1", () => {
    const result = scoreFraudRisk({
      priorClaimsOnPolicy: 10,
      daysSincePolicyStart: -1,
    });
    expect(result.score).toBe(1);
  });
});
