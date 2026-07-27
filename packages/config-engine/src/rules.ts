import jsonLogic from "json-logic-js";
import type { Product, QuoteInput } from "./types.js";

export interface RuleOutcome {
  referrals: Array<{ id: string; message: string }>;
  errors: Array<{ id: string; message: string }>;
}

/**
 * Evaluate the product's declarative rules against the quote. Rules are
 * json-logic predicates in the YAML — eligibility, referral thresholds and
 * statutory validations — so underwriting policy is edited as data, not code.
 */
export function runRules(product: Product, input: QuoteInput): RuleOutcome {
  const context = {
    age: input.vehicle.age,
    idv: input.vehicle.idv,
    cc: input.vehicle.cc,
    ncb: input.policy.ncb,
    tpSelected: input.coverages.tpSelected,
  };

  const outcome: RuleOutcome = { referrals: [], errors: [] };

  for (const rule of product.rules) {
    if (jsonLogic.apply(rule.when, context) === true) {
      const entry = { id: rule.id, message: rule.message };
      if (rule.action === "refer") outcome.referrals.push(entry);
      else outcome.errors.push(entry);
    }
  }

  return outcome;
}
