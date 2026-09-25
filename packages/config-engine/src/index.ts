import { runRating } from "./rating.js";
import { runRules } from "./rules.js";
import type { Product, QuoteInput, RatingResult } from "./types.js";

export type {
  Product,
  QuoteInput,
  RatingResult,
  Rule,
  AddOn,
  Band,
  Loading,
  FormBinding,
} from "./types.js";
export { loadProduct } from "./loader.js";
export type { LoadedProduct } from "./loader.js";
export { runRating } from "./rating.js";
export { runRules } from "./rules.js";
export type { RuleOutcome } from "./rules.js";
export { nextNcbTier } from "./renewal.js";

/**
 * Quote a risk against a product: price it, then run the rules. One pass, no
 * product-specific branches — the engine is the same for every line.
 */
export function quote(product: Product, input: QuoteInput): RatingResult {
  const { breakdown, sumInsured } = runRating(product, input);
  const { referrals, errors } = runRules(product, input);

  return {
    productCode: product.product,
    productVersion: product.version,
    breakdown,
    total: breakdown.total ?? 0,
    sumInsured,
    referrals,
    errors,
  };
}
