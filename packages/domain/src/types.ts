/**
 * Core temporal types for the effective-dated policy model.
 *
 * The whole design turns on one idea: a policy is not a row you update, it is a
 * TIMELINE you reconstruct. Business facts live in "business time" (effective
 * dates); when we learned them lives in "system time" (recordedAt). Keeping both
 * axes is what lets us answer "what did this policy look like on date X, as best
 * we knew on date Y" — and what makes backdated / out-of-sequence endorsements
 * recompute correctly instead of corrupting history.
 */

/** Half-open business-time interval: [from, to). ISO `YYYY-MM-DD`. */
export interface DateRange {
  from: string;
  to: string;
}

/** A contiguous stretch of business time over which a snapshot holds. */
export interface Slice<S> {
  effective: DateRange;
  snapshot: S;
}

/** A pure transform applied to the prior snapshot to produce the next one. */
export type Change<S> = (prev: S) => S;

export type TxnType = "ENDORSE" | "RENEW" | "CANCEL";

/** The opening transaction: establishes the term and the base snapshot. */
export interface Issue<S> {
  /** [inception, expiry) */
  term: DateRange;
  /** system time this was recorded (ISO date-time) */
  recordedAt: string;
  base: S;
}

/** A subsequent transaction that changes the policy from `effectiveFrom` onward. */
export interface Transaction<S> {
  txnType: TxnType;
  /** business date the change takes effect */
  effectiveFrom: string;
  /** system time this was recorded (ISO date-time) — may be AFTER effectiveFrom (backdated) */
  recordedAt: string;
  apply: Change<S>;
}
