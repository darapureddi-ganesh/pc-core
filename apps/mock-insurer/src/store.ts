import type { PolicyAggregate, PolicyStatus, RiskChange } from "@pc-core/ports";

/**
 * "Beta Insurance's" own internal record shape — deliberately unlike
 * PolicyAggregate: different field names, lower-case status codes, and the
 * risk/endorsements stored as opaque JSON blobs (a common pattern in real
 * legacy policy admin systems). This is the thing a connector's translation
 * layer actually earns its keep on.
 */
export interface BetaRecord {
  id: string;
  number: string | null;
  productCd: string;
  productRev: string;
  state: "quoted" | "bound" | "issued" | "cancelled";
  startDt: string;
  endDt: string;
  insuredNm: string | null;
  riskBlob: string; // JSON-encoded MotorRisk
  loggedAt: string;
  txns: Array<{ kind: "ENDORSE"; effDt: string; loggedAt: string; deltaBlob: string }>;
  cancelDt?: string;
}

const STATUS_TO_BETA: Record<PolicyStatus, BetaRecord["state"]> = {
  QUOTED: "quoted",
  BOUND: "bound",
  ISSUED: "issued",
  CANCELLED: "cancelled",
};
const STATUS_FROM_BETA: Record<BetaRecord["state"], PolicyStatus> = {
  quoted: "QUOTED",
  bound: "BOUND",
  issued: "ISSUED",
  cancelled: "CANCELLED",
};

/** pc-core's contract shape -> Beta's own internal shape. */
export function toBeta(policy: PolicyAggregate): BetaRecord {
  return {
    id: policy.policyId,
    number: policy.policyNumber,
    productCd: policy.productCode,
    productRev: policy.productVersion,
    state: STATUS_TO_BETA[policy.status],
    startDt: policy.term.from,
    endDt: policy.term.to,
    insuredNm: policy.insured?.name ?? null,
    riskBlob: JSON.stringify(policy.base),
    loggedAt: policy.baseRecordedAt,
    txns: policy.transactions.map((t) => ({
      kind: t.txnType,
      effDt: t.effectiveFrom,
      loggedAt: t.recordedAt,
      deltaBlob: JSON.stringify(t.change),
    })),
    cancelDt: policy.cancelledEffectiveFrom,
  };
}

/** Beta's own internal shape -> pc-core's contract shape. */
export function toContract(r: BetaRecord): PolicyAggregate {
  return {
    policyId: r.id,
    policyNumber: r.number,
    productCode: r.productCd,
    productVersion: r.productRev,
    status: STATUS_FROM_BETA[r.state],
    term: { from: r.startDt, to: r.endDt },
    base: JSON.parse(r.riskBlob),
    baseRecordedAt: r.loggedAt,
    transactions: r.txns.map((t) => ({
      txnType: t.kind,
      effectiveFrom: t.effDt,
      recordedAt: t.loggedAt,
      change: JSON.parse(t.deltaBlob) as RiskChange,
    })),
    cancelledEffectiveFrom: r.cancelDt,
    insured: r.insuredNm ? { name: r.insuredNm } : undefined,
  };
}
