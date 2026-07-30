import type { QuoteInput, RatingResult } from "@pc-core/config-engine";
import type { DateRange } from "@pc-core/domain";

/** The risk we price — identical to what the engine takes as a quote input. */
export type MotorRisk = QuoteInput;

export type PolicyStatus = "QUOTED" | "BOUND" | "ISSUED" | "CANCELLED";

/**
 * A persistable endorsement delta. Storing changes as DATA (not closures) is
 * what lets the timeline be reconstructed and re-rated from the database, and
 * what makes backdated / out-of-sequence endorsements compose correctly.
 */
export type RiskChange =
  | { op: "setIdv"; idv: number }
  | { op: "setNcb"; ncb: number }
  | { op: "addAddOn"; code: string }
  | { op: "removeAddOn"; code: string };

export interface StoredTxn {
  txnType: "ENDORSE";
  /** business date the change takes effect */
  effectiveFrom: string;
  /** system time it was recorded (may be well after effectiveFrom) */
  recordedAt: string;
  change: RiskChange;
}

/** The persisted policy: a base risk over a term, plus a log of endorsements. */
export interface PolicyAggregate {
  policyId: string;
  policyNumber: string | null;
  productCode: string;
  productVersion: string;
  status: PolicyStatus;
  term: DateRange;
  base: MotorRisk;
  baseRecordedAt: string;
  transactions: StoredTxn[];
  cancelledEffectiveFrom?: string;
  /** policyholder identity — descriptive, used by documents */
  insured?: { name: string };
  /** links this policy to a Customer identity, so their history spans
   * renewals, multiple vehicles, and every claim across every policy */
  customerId?: string;
}

/** A reconstructed point-in-time view: the risk in effect and its re-rating. */
export interface PolicySnapshot {
  risk: MotorRisk;
  rating: RatingResult;
}

/**
 * The policy storage contract — this is the part of the "Connector SDK" a
 * connected company implements against their own database or system. Every
 * PolicyService method reaches storage only through this interface, so any
 * adapter that satisfies it — in-process, or over HTTP against a remote
 * system — works with the full lifecycle unchanged.
 */
export interface PolicyRepository {
  create(policy: PolicyAggregate): Promise<void>;
  get(policyId: string): Promise<PolicyAggregate | undefined>;
  save(policy: PolicyAggregate): Promise<void>;
  list(): Promise<PolicyAggregate[]>;
  nextPolicyNumber(): Promise<string>;
}
