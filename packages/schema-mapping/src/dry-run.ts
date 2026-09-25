import type { PolicyAggregate } from "@pc-core/ports";
import { applyPolicyEnvelopeMapping } from "./apply.js";
import { validateMappedPolicy } from "./validate.js";
import type { PolicyEnvelopeMapping } from "./types.js";

export interface DryRunSampleResult {
  mapped?: PolicyAggregate;
  errors: string[];
}

export interface DryRunResult {
  /** true only if every sample mapped AND validated cleanly */
  valid: boolean;
  samples: DryRunSampleResult[];
}

/**
 * Applies a candidate mapping to every sample record and validates each
 * result — the deterministic gate a proposed mapping (model-suggested or
 * hand-written) must pass before anyone, human or automated, trusts it.
 * Never throws: a mapping that blows up on one sample is exactly the kind
 * of result this function exists to surface, not hide.
 */
export function dryRunMapping(
  samples: unknown[],
  mapping: PolicyEnvelopeMapping,
): DryRunResult {
  const results = samples.map((sample): DryRunSampleResult => {
    try {
      const mapped = applyPolicyEnvelopeMapping(sample, mapping);
      const { valid, errors } = validateMappedPolicy(mapped);
      return valid ? { mapped, errors: [] } : { errors };
    } catch (err) {
      return { errors: [err instanceof Error ? err.message : String(err)] };
    }
  });
  return {
    valid: samples.length > 0 && results.every((r) => r.errors.length === 0),
    samples: results,
  };
}
