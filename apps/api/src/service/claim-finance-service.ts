import { randomUUID } from "node:crypto";
import { irdaiClock } from "@pc-core/claims-queue";
import type {
  Claim,
  ClaimPayment,
  ClaimsRepository,
  Handler,
  HandlersRepository,
} from "@pc-core/ports";
import { ServiceError } from "./errors.js";
import { logActivity } from "./claims-service.js";

export interface PaymentCommand {
  claimId: string;
  payee: string;
  payeeType: ClaimPayment["payeeType"];
  mode: ClaimPayment["mode"];
  /** bank account number (NEFT/IMPS) or UPI ID */
  account: string;
  ifsc?: string;
  amount: number;
  requestedBy: string; // handlerId
}

export interface ClaimsOverview {
  openClaims: number;
  outstandingReserves: number;
  paid: number;
  awaitingApproval: number;
  recovered: number;
  irdaiOverdue: number;
  byStage: Record<string, number>;
  paidByClaimType: Record<string, number>;
  paidByHandler: Record<string, number>;
}

const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT = /^\d{9,18}$/;
const UPI = /^[\w.-]{2,}@[a-z]{2,}$/i;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const committed = (c: Claim): number => sum((c.payments ?? []).map((p) => p.amount));
const released = (c: Claim): number =>
  sum((c.payments ?? []).filter((p) => p.status === "RELEASED").map((p) => p.amount));

/**
 * Money out (claim payments with maker-checker approval above a handler's
 * payment authority) and money back (subrogation / salvage recovery). Every
 * action lands in the claim's activity log.
 */
export class ClaimFinanceService {
  constructor(
    private readonly claims: ClaimsRepository,
    private readonly handlers: HandlersRepository,
  ) {}

  async listHandlers(): Promise<Handler[]> {
    return this.handlers.list();
  }

  async addPayment(cmd: PaymentCommand): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.status === "SETTLED") throw new ServiceError("claim is already settled", "CONFLICT");
    const requester = await this.handler(cmd.requestedBy);

    if (!(cmd.amount > 0)) throw new ServiceError("payment must be positive", "BAD_REQUEST");
    let destination: string;
    if (cmd.mode === "UPI") {
      if (!UPI.test(cmd.account)) throw new ServiceError("UPI ID must look like name@bank", "BAD_REQUEST");
      destination = cmd.account;
    } else {
      const ifsc = (cmd.ifsc ?? "").toUpperCase();
      if (!ACCOUNT.test(cmd.account)) throw new ServiceError("account number must be 9 to 18 digits", "BAD_REQUEST");
      if (!IFSC.test(ifsc)) throw new ServiceError("IFSC must be 11 characters, like HDFC0001234", "BAD_REQUEST");
      destination = `${ifsc} · xx${cmd.account.slice(-4)}`;
    }

    const outstanding = claim.reserveAmount - committed(claim);
    if (cmd.amount > outstanding) {
      throw new ServiceError(
        `payment ${cmd.amount} exceeds the outstanding reserve ${outstanding}; raise the reserve first`,
        "BAD_REQUEST",
      );
    }

    const status = cmd.amount <= (requester.paymentAuthority ?? 0) ? "RELEASED" : "AWAITING_APPROVAL";
    claim.payments = [
      ...(claim.payments ?? []),
      {
        paymentId: randomUUID(),
        payee: cmd.payee,
        payeeType: cmd.payeeType,
        mode: cmd.mode,
        destination,
        amount: cmd.amount,
        status,
        requestedBy: requester.handlerId,
        createdAt: new Date().toISOString(),
      },
    ];
    logActivity(
      claim,
      requester.name,
      `INR ${cmd.amount} payment to ${cmd.payee} by ${cmd.mode}: ${status === "RELEASED" ? "released" : "sent for approval"}`,
    );
    await this.claims.save(claim);
    return claim;
  }

  /** Maker-checker: someone other than the requester, with enough authority. */
  async approvePayment(cmd: { claimId: string; paymentId: string; approvedBy: string }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    const payment = claim.payments?.find((p) => p.paymentId === cmd.paymentId);
    if (!payment) throw new ServiceError(`payment ${cmd.paymentId} not found`, "NOT_FOUND");
    if (payment.status !== "AWAITING_APPROVAL") throw new ServiceError("payment is not awaiting approval", "CONFLICT");
    const approver = await this.handler(cmd.approvedBy);
    if (approver.handlerId === payment.requestedBy) {
      throw new ServiceError("the requester cannot approve their own payment", "CONFLICT");
    }
    if ((approver.paymentAuthority ?? 0) < payment.amount) {
      throw new ServiceError(`${approver.name}'s payment authority is below ${payment.amount}`, "CONFLICT");
    }
    payment.status = "RELEASED";
    payment.approvedBy = approver.handlerId;
    logActivity(claim, approver.name, `INR ${payment.amount} payment to ${payment.payee} approved and released`);
    await this.claims.save(claim);
    return claim;
  }

  async openRecovery(cmd: {
    claimId: string;
    against: string;
    theirInsurer?: string;
    targetMin: number;
    targetMax: number;
    by: string;
  }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.recovery) throw new ServiceError("a recovery is already open on this claim", "CONFLICT");
    if (cmd.targetMin < 0 || cmd.targetMax < cmd.targetMin) {
      throw new ServiceError("target range must be non-negative, with max at least min", "BAD_REQUEST");
    }
    claim.recovery = {
      against: cmd.against,
      ...(cmd.theirInsurer && { theirInsurer: cmd.theirInsurer }),
      targetMin: cmd.targetMin,
      targetMax: cmd.targetMax,
      steps: [],
    };
    logActivity(claim, cmd.by, `Recovery opened against ${cmd.against}`);
    await this.claims.save(claim);
    return claim;
  }

  async addRecoveryStep(cmd: {
    claimId: string;
    step: string;
    amount?: number;
    note?: string;
    by: string;
  }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    const recovery = this.openRecoveryOf(claim);
    recovery.steps.push({
      at: new Date().toISOString(),
      step: cmd.step,
      ...(cmd.amount !== undefined && { amount: cmd.amount }),
      ...(cmd.note && { note: cmd.note }),
    });
    logActivity(claim, cmd.by, `Recovery step: ${cmd.step}`);
    await this.claims.save(claim);
    return claim;
  }

  async settleRecovery(cmd: { claimId: string; amount: number; date: string; by: string }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    const recovery = this.openRecoveryOf(claim);
    if (!(cmd.amount > 0)) throw new ServiceError("recovered amount must be positive", "BAD_REQUEST");
    recovery.settledAmount = cmd.amount;
    recovery.settledOn = cmd.date;
    logActivity(claim, cmd.by, `Recovery settled at INR ${cmd.amount}`);
    await this.claims.save(claim);
    return claim;
  }

  async overview(asOf: Date = new Date()): Promise<ClaimsOverview> {
    const claims = await this.claims.list();
    const names = new Map((await this.handlers.list()).map((h) => [h.handlerId, h.name]));
    const tally = (into: Record<string, number>, key: string, n: number) => {
      if (n) into[key] = (into[key] ?? 0) + n;
    };
    const open = claims.filter((c) => c.status !== "SETTLED");
    const o: ClaimsOverview = {
      openClaims: open.length,
      outstandingReserves: sum(open.map((c) => Math.max(0, c.reserveAmount - committed(c)))),
      paid: sum(claims.map(released)),
      awaitingApproval: sum(claims.map((c) => committed(c) - released(c))),
      recovered: sum(claims.map((c) => c.recovery?.settledAmount ?? 0)),
      irdaiOverdue: claims.filter((c) => irdaiClock(c, asOf)?.overdue).length,
      byStage: {},
      paidByClaimType: {},
      paidByHandler: {},
    };
    for (const c of claims) {
      tally(o.byStage, c.stage ?? "UNTRACKED", 1);
      tally(o.paidByClaimType, c.claimType ?? "UNCLASSIFIED", released(c));
      tally(o.paidByHandler, names.get(c.assignedHandlerId ?? "") ?? "Unassigned", released(c));
    }
    return o;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private openRecoveryOf(claim: Claim): NonNullable<Claim["recovery"]> {
    if (!claim.recovery) throw new ServiceError("no recovery is open on this claim", "CONFLICT");
    if (claim.recovery.settledAmount !== undefined) {
      throw new ServiceError("recovery is already settled", "CONFLICT");
    }
    return claim.recovery;
  }

  private async handler(handlerId: string): Promise<Handler> {
    const h = await this.handlers.get(handlerId);
    if (!h) throw new ServiceError(`handler ${handlerId} not found`, "NOT_FOUND");
    return h;
  }

  private async load(claimId: string): Promise<Claim> {
    const claim = await this.claims.get(claimId);
    if (!claim) throw new ServiceError(`claim ${claimId} not found`, "NOT_FOUND");
    return claim;
  }
}
