import type { Installment, InstallmentPlan, JournalEntry } from "@pc-core/billing";

export interface BillingAccount {
  policyId: string;
  plan: InstallmentPlan;
  total: number;
  installments: Installment[];
  entries: JournalEntry[];
  payments: Array<{ date: string; amount: number }>;
}

/** The billing storage contract — part of the Connector SDK. */
export interface BillingRepository {
  create(account: BillingAccount): Promise<void>;
  get(policyId: string): Promise<BillingAccount | undefined>;
  save(account: BillingAccount): Promise<void>;
}
