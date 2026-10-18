import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryClaimsRepository,
  InMemoryHandlersRepository,
  InMemoryPolicyRepository,
} from "@pc-core/adapters";
import type { Handler, MotorRisk } from "@pc-core/ports";
import { PolicyService } from "../src/service/policy-service.js";
import { ClaimsService } from "../src/service/claims-service.js";
import { ClaimFinanceService } from "../src/service/claim-finance-service.js";

const risk: MotorRisk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};

const handler = (handlerId: string, paymentAuthority: number): Handler => ({
  handlerId,
  name: handlerId,
  expertise: [],
  currentWorkload: 0,
  maxCapacity: 10,
  isAvailable: true,
  avgHandlingDays: 5,
  experienceYears: 5,
  paymentAuthority,
});

const neft = { payee: "Kharbanda Motors", payeeType: "GARAGE", mode: "NEFT", account: "123456789012", ifsc: "HDFC0001234" } as const;

let claims: ClaimsService;
let finance: ClaimFinanceService;
let claimId: string;

beforeEach(async () => {
  const policies = new PolicyService(new InMemoryPolicyRepository());
  const repo = new InMemoryClaimsRepository();
  claims = new ClaimsService(repo, policies);
  finance = new ClaimFinanceService(
    repo,
    new InMemoryHandlersRepository([handler("junior", 100_000), handler("senior", 500_000)]),
  );
  const { policyId } = await policies.quote({
    productCode: "PRIVATE_CAR",
    term: { from: "2026-01-01", to: "2027-01-01" },
    risk,
  });
  await policies.bind(policyId);
  await policies.issue(policyId);
  claimId = (await claims.fnol({ policyId, incidentDate: "2026-03-01", cause: "collision" })).claimId;
  await claims.setReserve({ claimId, amount: 300_000 });
});

describe("IRDAI survey workflow", () => {
  it("moves intimated -> survey -> assessment, in order only", async () => {
    expect((await claims.get(claimId)).stage).toBe("INTIMATED");
    await expect(claims.recordSurveyReport({ claimId, assessedAmount: 1, by: "x" })).rejects.toThrow(/stage INTIMATED/);
    await claims.appointSurveyor({ claimId, name: "R. K. Survey", by: "junior" });
    const c = await claims.recordSurveyReport({ claimId, assessedAmount: 148_600, by: "junior" });
    expect(c.stage).toBe("ASSESSMENT");
    expect(c.surveyor?.assessedAmount).toBe(148_600);
    expect(c.activity?.[0]?.text).toMatch(/assessed loss/);
  });
});

describe("claim payments — maker-checker above authority", () => {
  it("releases within the requester's authority, holds above it", async () => {
    const small = await finance.addPayment({ claimId, ...neft, amount: 50_000, requestedBy: "junior" });
    expect(small.payments?.[0]).toMatchObject({ status: "RELEASED", destination: "HDFC0001234 · xx9012" });
    const big = await finance.addPayment({ claimId, ...neft, amount: 150_000, requestedBy: "junior" });
    expect(big.payments?.[1]?.status).toBe("AWAITING_APPROVAL");
  });

  it("needs a different approver with enough authority", async () => {
    const c = await finance.addPayment({ claimId, ...neft, amount: 150_000, requestedBy: "junior" });
    const paymentId = c.payments![0]!.paymentId;
    await expect(finance.approvePayment({ claimId, paymentId, approvedBy: "junior" })).rejects.toThrow(/own payment/);
    const approved = await finance.approvePayment({ claimId, paymentId, approvedBy: "senior" });
    expect(approved.payments?.[0]).toMatchObject({ status: "RELEASED", approvedBy: "senior" });
  });

  it("never pays past the reserve, and the reserve cannot drop below what is committed", async () => {
    await finance.addPayment({ claimId, ...neft, amount: 250_000, requestedBy: "senior" });
    await expect(finance.addPayment({ claimId, ...neft, amount: 60_000, requestedBy: "senior" })).rejects.toThrow(/outstanding reserve/);
    await expect(claims.setReserve({ claimId, amount: 200_000 })).rejects.toThrow(/below/);
  });

  it("rejects a bad IFSC or UPI ID", async () => {
    await expect(finance.addPayment({ claimId, ...neft, ifsc: "HDFC1234", amount: 1, requestedBy: "junior" })).rejects.toThrow(/IFSC/);
    await expect(finance.addPayment({ claimId, ...neft, mode: "UPI", account: "nobank", amount: 1, requestedBy: "junior" })).rejects.toThrow(/UPI/);
  });
});

describe("recovery", () => {
  it("opens, logs steps, settles once, and counts in the overview", async () => {
    await finance.openRecovery({ claimId, against: "Truck HR55 AB 1029", targetMin: 60_000, targetMax: 120_000, by: "junior" });
    await finance.addRecoveryStep({ claimId, step: "Recovery demand letter", amount: 120_000, by: "junior" });
    await finance.settleRecovery({ claimId, amount: 90_000, date: "2026-04-01", by: "junior" });
    await expect(finance.addRecoveryStep({ claimId, step: "late", by: "junior" })).rejects.toThrow(/already settled/);
    expect((await finance.overview()).recovered).toBe(90_000);
  });
});
