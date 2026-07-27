import { describe, it, expect, beforeEach } from "vitest";
import { BillingService } from "../src/service/billing-service.js";
import { InMemoryBillingRepository } from "../src/service/billing-repository.js";

let billing: BillingService;
beforeEach(() => {
  billing = new BillingService(new InMemoryBillingRepository());
});

describe("billing ledger", () => {
  it("invoices a premium and draws it down with payments", async () => {
    const invoice = await billing.createInvoice({
      policyId: "p1",
      total: 21642.38,
      plan: "FULL",
      startDate: "2026-01-01",
    });
    expect(invoice.outstanding).toBeCloseTo(21642.38, 2);
    expect(invoice.installments).toHaveLength(1);

    const s1 = await billing.recordPayment({
      policyId: "p1",
      amount: 10000,
      date: "2026-01-05",
    });
    expect(s1.paid).toBeCloseTo(10000, 2);
    expect(s1.outstanding).toBeCloseTo(11642.38, 2);

    const s2 = await billing.recordPayment({
      policyId: "p1",
      amount: 11642.38,
      date: "2026-02-05",
    });
    expect(s2.outstanding).toBe(0);
  });

  it("rejects an overpayment", async () => {
    await billing.createInvoice({
      policyId: "p2",
      total: 1000,
      plan: "FULL",
      startDate: "2026-01-01",
    });
    await expect(
      billing.recordPayment({ policyId: "p2", amount: 1500, date: "2026-01-05" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("splits a quarterly plan into four installments summing to the total", async () => {
    const invoice = await billing.createInvoice({
      policyId: "p3",
      total: 21642.38,
      plan: "QUARTERLY",
      startDate: "2026-01-01",
    });
    expect(invoice.installments).toHaveLength(4);
    const sum = invoice.installments.reduce((s, i) => s + i.amount, 0);
    expect(Math.round(sum * 100) / 100).toBeCloseTo(21642.38, 2);
  });
});
