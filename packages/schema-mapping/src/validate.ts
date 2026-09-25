import type { MappingValidationResult } from "./types.js";

const VALID_STATUSES = new Set(["QUOTED", "BOUND", "ISSUED", "CANCELLED"]);

/**
 * A structural check on a mapped candidate — NOT a full re-implementation of
 * every field the rating engine expects inside `base` (that would mean
 * duplicating the whole product schema here). It checks the envelope: the
 * fields every PC Core service actually reads directly (policyId, status,
 * term, the shape of each transaction) plus that `base` and each
 * transaction's `change` at least parsed into an object. This is enough to
 * catch a wrong field name, wrong type, or an unmapped enum value — the
 * failure modes an inferred mapping actually produces — without pretending
 * to guarantee the risk payload itself rates correctly.
 */
export function validateMappedPolicy(candidate: unknown): MappingValidationResult {
  const errors: string[] = [];
  if (candidate === null || typeof candidate !== "object") {
    return { valid: false, errors: ["mapped result is not an object"] };
  }
  const c = candidate as Record<string, unknown>;

  if (typeof c.policyId !== "string" || c.policyId.length === 0) {
    errors.push("policyId must be a non-empty string");
  }
  if (c.policyNumber !== null && typeof c.policyNumber !== "string") {
    errors.push("policyNumber must be a string or null");
  }
  if (typeof c.productCode !== "string" || c.productCode.length === 0) {
    errors.push("productCode must be a non-empty string");
  }
  if (typeof c.productVersion !== "string" || c.productVersion.length === 0) {
    errors.push("productVersion must be a non-empty string");
  }
  if (typeof c.status !== "string" || !VALID_STATUSES.has(c.status)) {
    errors.push(`status must be one of ${[...VALID_STATUSES].join(", ")}, got ${JSON.stringify(c.status)}`);
  }
  const term = c.term as Record<string, unknown> | undefined;
  if (!term || typeof term.from !== "string" || typeof term.to !== "string") {
    errors.push("term.from and term.to must both be strings");
  }
  // `typeof [] === "object"` too — an array isn't a valid MotorRisk/RiskChange
  // object, so it must be rejected explicitly, not just null-checked.
  if (c.base === null || typeof c.base !== "object" || Array.isArray(c.base)) {
    errors.push("base must be an object, not an array (was it supposed to be marked JSON-encoded?)");
  }
  if (typeof c.baseRecordedAt !== "string") {
    errors.push("baseRecordedAt must be a string");
  }
  if (!Array.isArray(c.transactions)) {
    errors.push("transactions must be an array");
  } else {
    c.transactions.forEach((t, i) => {
      if (t === null || typeof t !== "object" || Array.isArray(t)) {
        errors.push(`transactions[${i}] must be an object`);
        return;
      }
      const item = t as Record<string, unknown>;
      if (item.txnType !== "ENDORSE") {
        errors.push(`transactions[${i}].txnType must be "ENDORSE"`);
      }
      if (typeof item.effectiveFrom !== "string" || typeof item.recordedAt !== "string") {
        errors.push(`transactions[${i}].effectiveFrom/recordedAt must be strings`);
      }
      if (item.change === null || typeof item.change !== "object" || Array.isArray(item.change)) {
        errors.push(`transactions[${i}].change must be an object, not an array (JSON-encoded?)`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
