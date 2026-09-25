/**
 * A declarative, deterministic description of how a company's own policy
 * record shape maps onto PC Core's `PolicyAggregate` contract — the same
 * translation `apps/mock-insurer/src/store.ts`'s `toContract`/`toBeta`
 * functions hand-write today, just expressed as data instead of code.
 *
 * This is deliberately NOT a general-purpose transform language (no
 * arbitrary expressions, no code execution) — it covers exactly the shape
 * of difference a real policy-admin system tends to have: renamed fields,
 * a different status enum, dates split across different field names, and a
 * risk/transaction-delta payload that's sometimes a JSON-encoded string
 * instead of a nested object. Anything stranger than that still needs a
 * hand-written adapter, same as before this package existed.
 */
export interface PolicyEnvelopeMapping {
  fields: {
    /** dot-path into the source record for each PolicyAggregate envelope field */
    policyId: string;
    policyNumber: string;
    productCode: string;
    productVersion: string;
    status: string;
    termFrom: string;
    termTo: string;
    /** source field holding the risk payload (object, or a JSON-encoded string — see baseIsJsonEncoded) */
    base: string;
    baseRecordedAt: string;
    /** source field holding the array of endorsement transactions */
    transactions: string;
    insuredName?: string;
    cancelledEffectiveFrom?: string;
    /** links the mapped policy to a Customer identity (see PolicyAggregate.customerId) */
    customerId?: string;
    /** the expiring policy this one renews (see PolicyAggregate.renewedFromPolicyId) */
    renewedFromPolicyId?: string;
  };
  /** source status value (as it literally appears in the record) -> PC Core's PolicyStatus */
  statusValues: Record<string, "QUOTED" | "BOUND" | "ISSUED" | "CANCELLED">;
  /** true if `fields.base` names a JSON-encoded string field, not a nested object */
  baseIsJsonEncoded?: boolean;
  /** per-item field mapping applied to every element of the transactions array */
  transactionFields: {
    txnType: string;
    effectiveFrom: string;
    recordedAt: string;
    /** the field holding the change payload (object, or JSON-encoded string — see transactionChangeIsJsonEncoded) */
    change: string;
  };
  /** true if transactionFields.change names a JSON-encoded string field, not a nested object */
  transactionChangeIsJsonEncoded?: boolean;
}

export interface MappingValidationResult {
  valid: boolean;
  errors: string[];
}

/** A provider-agnostic LLM contract, structurally identical to (and interchangeable
 * with) @pc-core/claims-ai's LlmClient — duplicated locally so this package stays
 * dependency-free, same stance as @pc-core/claims-ai itself. */
export interface LlmClient {
  complete(prompt: string): Promise<string>;
}
