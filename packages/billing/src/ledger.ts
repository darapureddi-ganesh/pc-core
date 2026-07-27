/**
 * A minimal double-entry ledger. Money is never tracked as a single mutable
 * balance; it is derived from immutable, balanced journal entries. That is what
 * makes billing auditable and reconcilable — the same discipline a real core needs.
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export type Account =
  | "PREMIUM_RECEIVABLE"
  | "WRITTEN_PREMIUM"
  | "CASH";

export interface JournalLine {
  account: Account;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  entryId: string;
  date: string;
  memo: string;
  lines: JournalLine[];
}

/** A posting is valid only if total debits equal total credits. */
export function isBalanced(lines: JournalLine[]): boolean {
  const debits = round2(lines.reduce((s, l) => s + l.debit, 0));
  const credits = round2(lines.reduce((s, l) => s + l.credit, 0));
  return debits === credits;
}

/** Debit-positive balance of an account across all entries. */
export function accountBalance(
  entries: JournalEntry[],
  account: Account,
): number {
  return round2(
    entries
      .flatMap((e) => e.lines)
      .filter((l) => l.account === account)
      .reduce((s, l) => s + l.debit - l.credit, 0),
  );
}
