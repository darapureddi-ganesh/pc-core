import type { PolicyAggregate, PolicyStatus, RiskChange } from "@pc-core/ports";
import { getPath, setPath } from "./paths.js";
import type { PolicyEnvelopeMapping } from "./types.js";

function parseIfEncoded(value: unknown, isEncoded: boolean | undefined, label: string): unknown {
  if (!isEncoded) return value;
  if (typeof value !== "string") {
    throw new Error(`${label} was marked JSON-encoded but the source value is not a string`);
  }
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} was marked JSON-encoded but failed to parse as JSON`);
  }
}

/**
 * Applies a mapping: a company's own record shape -> a candidate
 * PolicyAggregate. Pure and deterministic — no model involved at this step,
 * ever. The model (when one's configured) only ever PROPOSES the mapping
 * itself, once, offline; every real read/write runs this plain function.
 * Throws a descriptive error on the first field that doesn't fit, rather
 * than silently producing a wrong shape.
 */
export function applyPolicyEnvelopeMapping(
  source: unknown,
  mapping: PolicyEnvelopeMapping,
): PolicyAggregate {
  if (source === null || typeof source !== "object") {
    throw new Error("source record is not an object");
  }
  const f = mapping.fields;

  const rawStatus = getPath(source, f.status);
  if (typeof rawStatus !== "string" || !(rawStatus in mapping.statusValues)) {
    throw new Error(
      `status value ${JSON.stringify(rawStatus)} (from "${f.status}") has no entry in statusValues`,
    );
  }

  const rawTransactions = getPath(source, f.transactions);
  if (!Array.isArray(rawTransactions)) {
    throw new Error(`"${f.transactions}" is not an array`);
  }
  const tf = mapping.transactionFields;
  const transactions = rawTransactions.map((item, i) => {
    if (item === null || typeof item !== "object") {
      throw new Error(`transactions[${i}] is not an object`);
    }
    return {
      txnType: getPath(item, tf.txnType) as PolicyAggregate["transactions"][number]["txnType"],
      effectiveFrom: getPath(item, tf.effectiveFrom) as string,
      recordedAt: getPath(item, tf.recordedAt) as string,
      change: parseIfEncoded(
        getPath(item, tf.change),
        mapping.transactionChangeIsJsonEncoded,
        `transactions[${i}].${tf.change}`,
      ) as RiskChange,
    };
  });

  const insuredName = f.insuredName ? getPath(source, f.insuredName) : undefined;
  const cancelledEffectiveFrom = f.cancelledEffectiveFrom
    ? getPath(source, f.cancelledEffectiveFrom)
    : undefined;

  const policy: PolicyAggregate = {
    policyId: getPath(source, f.policyId) as string,
    policyNumber: (getPath(source, f.policyNumber) as string | null) ?? null,
    productCode: getPath(source, f.productCode) as string,
    productVersion: getPath(source, f.productVersion) as string,
    status: mapping.statusValues[rawStatus] as PolicyStatus,
    term: {
      from: getPath(source, f.termFrom) as string,
      to: getPath(source, f.termTo) as string,
    },
    base: parseIfEncoded(getPath(source, f.base), mapping.baseIsJsonEncoded, f.base) as PolicyAggregate["base"],
    baseRecordedAt: getPath(source, f.baseRecordedAt) as string,
    transactions,
    ...(typeof insuredName === "string" && { insured: { name: insuredName } }),
    ...(typeof cancelledEffectiveFrom === "string" && { cancelledEffectiveFrom }),
  };
  return policy;
}

/**
 * The reverse direction: a PolicyAggregate -> the company's own record
 * shape, so PC Core can write back through the same mapping it reads with.
 * Re-encodes any field the mapping marked as JSON-encoded.
 */
export function unapplyPolicyEnvelopeMapping(
  policy: PolicyAggregate,
  mapping: PolicyEnvelopeMapping,
): Record<string, unknown> {
  const f = mapping.fields;
  const sourceStatus = Object.entries(mapping.statusValues).find(
    ([, v]) => v === policy.status,
  )?.[0];
  if (!sourceStatus) {
    throw new Error(`no source status value maps to PolicyAggregate status "${policy.status}"`);
  }

  const out: Record<string, unknown> = {};
  setPath(out, f.policyId, policy.policyId);
  setPath(out, f.policyNumber, policy.policyNumber);
  setPath(out, f.productCode, policy.productCode);
  setPath(out, f.productVersion, policy.productVersion);
  setPath(out, f.status, sourceStatus);
  setPath(out, f.termFrom, policy.term.from);
  setPath(out, f.termTo, policy.term.to);
  setPath(out, f.base, mapping.baseIsJsonEncoded ? JSON.stringify(policy.base) : policy.base);
  setPath(out, f.baseRecordedAt, policy.baseRecordedAt);

  const tf = mapping.transactionFields;
  const encodedTransactions = policy.transactions.map((t) => {
    const item: Record<string, unknown> = {};
    setPath(item, tf.txnType, t.txnType);
    setPath(item, tf.effectiveFrom, t.effectiveFrom);
    setPath(item, tf.recordedAt, t.recordedAt);
    setPath(
      item,
      tf.change,
      mapping.transactionChangeIsJsonEncoded ? JSON.stringify(t.change) : t.change,
    );
    return item;
  });
  setPath(out, f.transactions, encodedTransactions);

  if (f.insuredName && policy.insured?.name) {
    setPath(out, f.insuredName, policy.insured.name);
  }
  if (f.cancelledEffectiveFrom && policy.cancelledEffectiveFrom) {
    setPath(out, f.cancelledEffectiveFrom, policy.cancelledEffectiveFrom);
  }
  return out;
}
