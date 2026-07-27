import { describe, it, expect } from "vitest";
import {
  isBalanced,
  accountBalance,
  installmentSchedule,
  type JournalEntry,
} from "../src/index.js";

describe("double-entry ledger", () => {
  it("accepts a balanced posting and rejects an unbalanced one", () => {
    expect(
      isBalanced([
        { account: "PREMIUM_RECEIVABLE", debit: 100, credit: 0 },
        { account: "WRITTEN_PREMIUM", debit: 0, credit: 100 },
      ]),
    ).toBe(true);
    expect(
      isBalanced([
        { account: "CASH", debit: 100, credit: 0 },
        { account: "PREMIUM_RECEIVABLE", debit: 0, credit: 90 },
      ]),
    ).toBe(false);
  });

  it("derives an account balance from entries", () => {
    const entries: JournalEntry[] = [
      {
        entryId: "1",
        date: "2026-01-01",
        memo: "invoice",
        lines: [
          { account: "PREMIUM_RECEIVABLE", debit: 21642.38, credit: 0 },
          { account: "WRITTEN_PREMIUM", debit: 0, credit: 21642.38 },
        ],
      },
      {
        entryId: "2",
        date: "2026-01-05",
        memo: "payment",
        lines: [
          { account: "CASH", debit: 5000, credit: 0 },
          { account: "PREMIUM_RECEIVABLE", debit: 0, credit: 5000 },
        ],
      },
    ];
    expect(accountBalance(entries, "PREMIUM_RECEIVABLE")).toBe(16642.38);
    expect(accountBalance(entries, "CASH")).toBe(5000);
  });
});

describe("installment schedule", () => {
  it("full plan is a single installment for the whole premium", () => {
    const s = installmentSchedule(21642.38, "FULL", "2026-01-01");
    expect(s).toEqual([{ seq: 1, dueDate: "2026-01-01", amount: 21642.38 }]);
  });

  it("quarterly plan sums exactly to the total and steps by three months", () => {
    const s = installmentSchedule(1000, "QUARTERLY", "2026-01-01");
    expect(s.map((i) => i.dueDate)).toEqual([
      "2026-01-01",
      "2026-04-01",
      "2026-07-01",
      "2026-10-01",
    ]);
    expect(round(s.reduce((sum, i) => sum + i.amount, 0))).toBe(1000);
  });
});

const round = (n: number) => Math.round(n * 100) / 100;
