import type { ClaimType, Complexity, Priority } from "./types.js";

export interface CompanyRules {
  /** keywords that force CRITICAL priority regardless of amount (e.g. "ICU", "fatal") */
  urgentKeywords: string[];
  /** claim-amount cutoffs a baseline priority is derived from */
  priorityThresholds: { critical: number; high: number; medium: number };
  /** policyholder IDs whose claims are always CRITICAL */
  vipPolicyholderIds: string[];
}

export const DEFAULT_COMPANY_RULES: CompanyRules = {
  urgentKeywords: ["icu", "death", "fatal", "catastrophe", "permanent disability"],
  priorityThresholds: { critical: 500000, high: 200000, medium: 50000 },
  vipPolicyholderIds: [],
};

export interface ClassifyInput {
  /** FNOL free-text description (the claim's `cause`, plus any raw intake note) */
  description: string;
  /** claim amount to classify against — typically the sum insured at incident date */
  amount: number;
  policyholderId?: string;
}

export interface ClassifyResult {
  claimType: ClaimType;
  priority: Priority;
  complexity: Complexity;
  predictedHandlingDays: number;
  /** what the baseline heuristic (no company rules) would have said — for pipeline transparency */
  baselinePriority: Priority;
  baselineClaimType: ClaimType;
  /** which rule fired and overrode the baseline, if any */
  ruleApplied: string | null;
  classificationSource: "baseline" | "rule";
}

function classifyType(description: string): ClaimType {
  const text = description.toLowerCase();
  if (/theft|stolen|stole/.test(text)) return "MOTOR_THEFT";
  if (/accident|collision|crash|hit|damage/.test(text)) return "MOTOR_ACCIDENT";
  return "MOTOR_OTHER";
}

function priorityForAmount(
  amount: number,
  thresholds: CompanyRules["priorityThresholds"],
): Priority {
  if (amount >= thresholds.critical) return "CRITICAL";
  if (amount >= thresholds.high) return "HIGH";
  if (amount >= thresholds.medium) return "MEDIUM";
  return "LOW";
}

function complexityFor(amount: number, claimType: ClaimType): Complexity {
  if (claimType === "MOTOR_THEFT" || amount >= 200000) return "COMPLEX";
  if (amount >= 50000) return "MODERATE";
  return "SIMPLE";
}

const HANDLING_DAYS: Record<Complexity, number> = {
  SIMPLE: 3,
  MODERATE: 10,
  COMPLEX: 25,
};

/**
 * Rule-based classification pipeline — no hosted ML (pc-core ships no model, same
 * stance as @pc-core/claims-ai's fraud scorer). A deterministic baseline heuristic
 * runs first; a company's own rules (VIP policyholder, urgent keywords, amount
 * thresholds) can then override it. Both the baseline and the final decision are
 * returned so the override is auditable, not silent.
 *
 * Rule priority: VIP policyholder -> urgent keyword -> amount threshold (baseline).
 */
export function classifyClaim(
  input: ClassifyInput,
  rules: CompanyRules = DEFAULT_COMPANY_RULES,
): ClassifyResult {
  const baselineClaimType = classifyType(input.description);
  const baselinePriority = priorityForAmount(input.amount, rules.priorityThresholds);

  let priority = baselinePriority;
  let ruleApplied: string | null = null;

  if (input.policyholderId && rules.vipPolicyholderIds.includes(input.policyholderId)) {
    priority = "CRITICAL";
    ruleApplied = "vip_policyholder";
  } else {
    const text = input.description.toLowerCase();
    const matchedKeyword = rules.urgentKeywords.find((kw) => text.includes(kw));
    if (matchedKeyword) {
      priority = "CRITICAL";
      ruleApplied = `urgent_keyword:${matchedKeyword}`;
    }
  }

  const claimType = baselineClaimType;
  const complexity = complexityFor(input.amount, claimType);

  return {
    claimType,
    priority,
    complexity,
    predictedHandlingDays: HANDLING_DAYS[complexity],
    baselinePriority,
    baselineClaimType,
    ruleApplied,
    classificationSource: ruleApplied ? "rule" : "baseline",
  };
}
