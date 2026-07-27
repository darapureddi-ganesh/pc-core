import { round2 } from "./ledger.js";

export type InstallmentPlan = "FULL" | "QUARTERLY";

export interface Installment {
  seq: number;
  dueDate: string;
  amount: number;
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/**
 * Split a premium into installments. The last installment absorbs any rounding
 * remainder so the schedule always sums exactly to the total.
 */
export function installmentSchedule(
  total: number,
  plan: InstallmentPlan,
  startDate: string,
): Installment[] {
  const count = plan === "QUARTERLY" ? 4 : 1;
  const even = Math.floor((total / count) * 100) / 100;

  const installments: Installment[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    const amount = isLast ? round2(total - allocated) : even;
    allocated = round2(allocated + amount);
    installments.push({
      seq: i + 1,
      dueDate: addMonths(startDate, i * 3),
      amount,
    });
  }
  return installments;
}
