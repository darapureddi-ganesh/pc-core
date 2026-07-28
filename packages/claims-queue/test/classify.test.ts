import { describe, it, expect } from "vitest";
import { classifyClaim, DEFAULT_COMPANY_RULES } from "../src/index.js";

describe("classifyClaim — rule-based triage pipeline", () => {
  it("classifies a low-value claim with no rule hits as the baseline", () => {
    const result = classifyClaim({ description: "minor bumper scratch", amount: 8000 });
    expect(result.claimType).toBe("MOTOR_OTHER");
    expect(result.priority).toBe("LOW");
    expect(result.classificationSource).toBe("baseline");
    expect(result.ruleApplied).toBeNull();
  });

  it("detects an accident claim type from the description", () => {
    const result = classifyClaim({ description: "collision at signal, front damage", amount: 8000 });
    expect(result.claimType).toBe("MOTOR_ACCIDENT");
  });

  it("detects a theft claim type and forces COMPLEX regardless of amount", () => {
    const result = classifyClaim({ description: "vehicle stolen from parking lot", amount: 5000 });
    expect(result.claimType).toBe("MOTOR_THEFT");
    expect(result.complexity).toBe("COMPLEX");
  });

  it("derives baseline priority from amount thresholds", () => {
    expect(classifyClaim({ description: "", amount: 40000 }).priority).toBe("LOW");
    expect(classifyClaim({ description: "", amount: 60000 }).priority).toBe("MEDIUM");
    expect(classifyClaim({ description: "", amount: 250000 }).priority).toBe("HIGH");
    expect(classifyClaim({ description: "", amount: 600000 }).priority).toBe("CRITICAL");
  });

  it("an urgent keyword overrides a low baseline priority to CRITICAL", () => {
    const result = classifyClaim({ description: "claimant taken to ICU after crash", amount: 8000 });
    expect(result.baselinePriority).toBe("LOW");
    expect(result.priority).toBe("CRITICAL");
    expect(result.ruleApplied).toBe("urgent_keyword:icu");
    expect(result.classificationSource).toBe("rule");
  });

  it("a VIP policyholder overrides priority to CRITICAL ahead of keyword rules", () => {
    const rules = { ...DEFAULT_COMPANY_RULES, vipPolicyholderIds: ["PH-VIP-1"] };
    const result = classifyClaim(
      { description: "minor scratch", amount: 8000, policyholderId: "PH-VIP-1" },
      rules,
    );
    expect(result.priority).toBe("CRITICAL");
    expect(result.ruleApplied).toBe("vip_policyholder");
  });
});
