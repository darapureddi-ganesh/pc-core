import { randomUUID } from "node:crypto";
import {
  accountBalance,
  installmentSchedule,
  isBalanced,
  round2,
  type InstallmentPlan,
  type JournalEntry,
} from "@pc-core/billing";
import type { BillingAccount, BillingRepository } from "@pc-core/ports";
import { ServiceError } from "./errors.js";

export interface Statement {
  policyId: string;
  plan: InstallmentPlan;
  total: number;
  paid: number;
  outstanding: number;
  installments: BillingAccount["installments"];
}

/**
 * Premium billing over the double-entry ledger. Issuing an invoice posts the
 * premium as receivable; payments draw it down. Balances are always derived
 * from the ledger, never stored as a mutable number.
 */
export class BillingService {
  constructor(private readonly repo: BillingRepository) {}

  async createInvoice(cmd: {
    policyId: string;
    total: number;
    plan?: InstallmentPlan;
    startDate: string;
  }): Promise<Statement> {
    if (await this.repo.get(cmd.policyId)) {
      throw new ServiceError("policy is already invoiced", "CONFLICT");
    }
    const plan = cmd.plan ?? "FULL";
    const entry = this.post("premium invoiced", cmd.startDate, [
      { account: "PREMIUM_RECEIVABLE", debit: cmd.total, credit: 0 },
      { account: "WRITTEN_PREMIUM", debit: 0, credit: cmd.total },
    ]);

    const account: BillingAccount = {
      policyId: cmd.policyId,
      plan,
      total: cmd.total,
      installments: installmentSchedule(cmd.total, plan, cmd.startDate),
      entries: [entry],
      payments: [],
    };
    await this.repo.create(account);
    return this.toStatement(account);
  }

  async recordPayment(cmd: {
    policyId: string;
    amount: number;
    date: string;
  }): Promise<Statement> {
    const account = await this.load(cmd.policyId);
    const outstanding = accountBalance(account.entries, "PREMIUM_RECEIVABLE");
    if (cmd.amount <= 0) {
      throw new ServiceError("payment must be positive", "BAD_REQUEST");
    }
    if (round2(cmd.amount) > outstanding) {
      throw new ServiceError(
        `payment ${cmd.amount} exceeds outstanding ${outstanding}`,
        "BAD_REQUEST",
      );
    }
    account.entries.push(
      this.post("payment received", cmd.date, [
        { account: "CASH", debit: cmd.amount, credit: 0 },
        { account: "PREMIUM_RECEIVABLE", debit: 0, credit: cmd.amount },
      ]),
    );
    account.payments.push({ date: cmd.date, amount: cmd.amount });
    await this.repo.save(account);
    return this.toStatement(account);
  }

  async statement(policyId: string): Promise<Statement> {
    return this.toStatement(await this.load(policyId));
  }

  // ── internals ────────────────────────────────────────────────────────────

  private post(
    memo: string,
    date: string,
    lines: JournalEntry["lines"],
  ): JournalEntry {
    if (!isBalanced(lines)) {
      throw new ServiceError(`unbalanced journal entry: ${memo}`, "BAD_REQUEST");
    }
    return { entryId: randomUUID(), date, memo, lines };
  }

  private toStatement(account: BillingAccount): Statement {
    const outstanding = accountBalance(account.entries, "PREMIUM_RECEIVABLE");
    return {
      policyId: account.policyId,
      plan: account.plan,
      total: account.total,
      paid: round2(account.total - outstanding),
      outstanding,
      installments: account.installments,
    };
  }

  private async load(policyId: string): Promise<BillingAccount> {
    const account = await this.repo.get(policyId);
    if (!account) {
      throw new ServiceError(`no billing for policy ${policyId}`, "NOT_FOUND");
    }
    return account;
  }
}
