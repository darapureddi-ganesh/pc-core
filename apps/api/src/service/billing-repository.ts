import type { Installment, InstallmentPlan, JournalEntry } from "@pc-core/billing";

export interface BillingAccount {
  policyId: string;
  plan: InstallmentPlan;
  total: number;
  installments: Installment[];
  entries: JournalEntry[];
  payments: Array<{ date: string; amount: number }>;
}

export interface BillingRepository {
  create(account: BillingAccount): Promise<void>;
  get(policyId: string): Promise<BillingAccount | undefined>;
  save(account: BillingAccount): Promise<void>;
}

export class InMemoryBillingRepository implements BillingRepository {
  private readonly store = new Map<string, BillingAccount>();

  async create(account: BillingAccount): Promise<void> {
    this.store.set(account.policyId, structuredClone(account));
  }
  async get(policyId: string): Promise<BillingAccount | undefined> {
    const found = this.store.get(policyId);
    return found ? structuredClone(found) : undefined;
  }
  async save(account: BillingAccount): Promise<void> {
    this.store.set(account.policyId, structuredClone(account));
  }
}
