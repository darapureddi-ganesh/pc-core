import type { LlmClient, PolicyEnvelopeMapping } from "./types.js";

const REQUIRED_FIELD_KEYS = [
  "policyId",
  "policyNumber",
  "productCode",
  "productVersion",
  "status",
  "termFrom",
  "termTo",
  "base",
  "baseRecordedAt",
  "transactions",
] as const;

const VALID_STATUSES = new Set(["QUOTED", "BOUND", "ISSUED", "CANCELLED"]);

/**
 * Proposes a `PolicyEnvelopeMapping` from a handful of sample records in a
 * company's own shape — the one-time, offline step this whole package
 * exists to avoid doing by hand. This is a PROPOSAL only: the caller must
 * run `dryRunMapping` against the same samples (or fresh ones) before
 * trusting it, and per PC Core's policy this mapping is meant to be
 * reviewed and confirmed by a person once, not applied automatically just
 * because it validates — a mapping that happens to pass on 2-3 samples can
 * still be subtly wrong on the full dataset.
 *
 * Degrades to `null` (no proposal) on a malformed reply or a failed model
 * call — never guesses, never throws, same stance as every other LLM seam
 * in this codebase (see @pc-core/claims-ai's LlmFraudScorer/LlmTriageAdvisor).
 */
export class LlmPolicyMappingAdvisor {
  constructor(private readonly llm: LlmClient) {}

  async proposeMapping(sampleRecords: unknown[]): Promise<PolicyEnvelopeMapping | null> {
    if (sampleRecords.length === 0) return null;

    const prompt = [
      "You map a company's own policy-record JSON shape onto a fixed target shape.",
      "Look at the sample record(s) below and propose a field mapping.",
      "",
      "Target envelope fields (dot-paths into the SOURCE record, as strings):",
      "  policyId, policyNumber, productCode, productVersion, status,",
      "  termFrom, termTo, base, baseRecordedAt, transactions,",
      "  insuredName (optional), cancelledEffectiveFrom (optional)",
      "",
      "Return ONLY strict JSON of the form:",
      "{",
      '  "fields": { "policyId": string, "policyNumber": string, "productCode": string,',
      '              "productVersion": string, "status": string, "termFrom": string,',
      '              "termTo": string, "base": string, "baseRecordedAt": string,',
      '              "transactions": string, "insuredName"?: string, "cancelledEffectiveFrom"?: string },',
      '  "statusValues": { "<source status value>": "QUOTED"|"BOUND"|"ISSUED"|"CANCELLED", ... },',
      '  "baseIsJsonEncoded": boolean,',
      '  "transactionFields": { "txnType": string, "effectiveFrom": string, "recordedAt": string, "change": string },',
      '  "transactionChangeIsJsonEncoded": boolean',
      "}",
      "",
      "Sample record(s):",
      JSON.stringify(sampleRecords.slice(0, 3), null, 2),
    ].join("\n");

    let reply: string;
    try {
      reply = await this.llm.complete(prompt);
    } catch {
      return null;
    }
    return parseMapping(reply);
  }
}

function parseMapping(reply: string): PolicyEnvelopeMapping | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(isolateJson(reply)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const fields = json.fields as Record<string, unknown> | undefined;
  if (!fields || REQUIRED_FIELD_KEYS.some((k) => typeof fields[k] !== "string")) {
    return null;
  }

  const statusValues = json.statusValues as Record<string, unknown> | undefined;
  if (
    !statusValues ||
    Object.keys(statusValues).length === 0 ||
    Object.values(statusValues).some((v) => typeof v !== "string" || !VALID_STATUSES.has(v))
  ) {
    return null;
  }

  const transactionFields = json.transactionFields as Record<string, unknown> | undefined;
  const requiredTxnKeys = ["txnType", "effectiveFrom", "recordedAt", "change"] as const;
  if (!transactionFields || requiredTxnKeys.some((k) => typeof transactionFields[k] !== "string")) {
    return null;
  }

  return {
    fields: fields as unknown as PolicyEnvelopeMapping["fields"],
    statusValues: statusValues as PolicyEnvelopeMapping["statusValues"],
    baseIsJsonEncoded: json.baseIsJsonEncoded === true,
    transactionFields: transactionFields as unknown as PolicyEnvelopeMapping["transactionFields"],
    transactionChangeIsJsonEncoded: json.transactionChangeIsJsonEncoded === true,
  };
}

/** Tolerate models that wrap JSON in prose or ```json fences. */
function isolateJson(reply: string): string {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  return start >= 0 && end > start ? reply.slice(start, end + 1) : reply;
}
