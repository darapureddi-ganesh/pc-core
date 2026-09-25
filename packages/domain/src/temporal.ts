import type { DateRange, Issue, Slice, Transaction } from "./types.js";

/** date ∈ [range.from, range.to) */
export function contains(range: DateRange, date: string): boolean {
  return range.from <= date && date < range.to;
}

/**
 * One calendar year after a YYYY-MM-DD date — plain string math for the
 * common case, falling back to `Date.UTC` (which normalizes month/day
 * overflow itself) only for Feb 29, since next year isn't necessarily a
 * leap year. A Feb-29 renewal anniversary lands on Mar 1 the following year
 * — a deliberate, common convention, not a bug to special-case further.
 */
export function addOneYear(date: string): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  if (m === 2 && d === 29) {
    const next = new Date(Date.UTC(y + 1, m - 1, d));
    return next.toISOString().slice(0, 10);
  }
  return `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Fold an issue + its transactions into a non-overlapping timeline of slices.
 *
 * Two things make this correct rather than naive:
 *
 *  1. Transactions are folded in BUSINESS-EFFECTIVE order, not the order they
 *     were recorded. A backdated endorsement therefore slots into its rightful
 *     place and its change naturally propagates forward through every later
 *     slice — i.e. out-of-sequence endorsements recompute downstream for free.
 *
 *  2. `systemAsOf` filters to transactions known by a given system time. Passing
 *     it reconstructs the policy "as we knew it then"; omitting it reconstructs
 *     "as we know it now". That is the second (system-time) axis of bitemporality.
 */
export function buildTimeline<S>(
  issue: Issue<S>,
  txns: Transaction<S>[],
  systemAsOf?: string,
): Slice<S>[] {
  const known = systemAsOf
    ? txns.filter((t) => t.recordedAt <= systemAsOf)
    : txns.slice();

  // business time first, recorded time as the tie-breaker
  const ordered = known.sort((a, b) =>
    a.effectiveFrom !== b.effectiveFrom
      ? a.effectiveFrom < b.effectiveFrom
        ? -1
        : 1
      : a.recordedAt < b.recordedAt
        ? -1
        : 1,
  );

  let slices: Slice<S>[] = [
    { effective: { ...issue.term }, snapshot: issue.base },
  ];

  for (const txn of ordered) {
    const next: Slice<S>[] = [];
    for (const slice of slices) {
      if (txn.effectiveFrom <= slice.effective.from) {
        // change covers the whole slice
        next.push({
          effective: slice.effective,
          snapshot: txn.apply(slice.snapshot),
        });
      } else if (txn.effectiveFrom >= slice.effective.to) {
        // change starts after this slice — untouched
        next.push(slice);
      } else {
        // split at the effective date: before is unchanged, after is transformed
        next.push({
          effective: { from: slice.effective.from, to: txn.effectiveFrom },
          snapshot: slice.snapshot,
        });
        next.push({
          effective: { from: txn.effectiveFrom, to: slice.effective.to },
          snapshot: txn.apply(slice.snapshot),
        });
      }
    }
    slices = next;
  }

  return slices;
}

/** The slice in effect on a given business date, if any. */
export function asOf<S>(
  slices: Slice<S>[],
  date: string,
): Slice<S> | undefined {
  return slices.find((s) => contains(s.effective, date));
}

/** Convenience: the snapshot in effect on a given business date. */
export function snapshotAsOf<S>(
  slices: Slice<S>[],
  date: string,
): S | undefined {
  return asOf(slices, date)?.snapshot;
}
