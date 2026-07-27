import { randomUUID } from "node:crypto";
import { ServiceError } from "./errors.js";
import type { PolicyService } from "./policy-service.js";
import type { Claim, ClaimsRepository } from "./claims-repository.js";

/**
 * Claims, anchored to the temporal policy model. First-notice-of-loss looks up
 * the policy as-of the INCIDENT date, so the cover (and sum insured) applied to
 * a claim is exactly what was in force then — even across mid-term endorsements.
 */
export class ClaimsService {
  constructor(
    private readonly repo: ClaimsRepository,
    private readonly policies: PolicyService,
  ) {}

  async fnol(cmd: {
    policyId: string;
    incidentDate: string;
    cause: string;
  }): Promise<Claim> {
    const policy = await this.policies.get(cmd.policyId); // throws NOT_FOUND
    if (policy.status !== "ISSUED") {
      throw new ServiceError("policy is not in force", "CONFLICT");
    }

    const snapshot = await this.policies.getAsOf(
      cmd.policyId,
      cmd.incidentDate,
    );
    if (!snapshot) {
      throw new ServiceError(
        "no cover in force on the incident date",
        "BAD_REQUEST",
      );
    }

    const claim: Claim = {
      claimId: randomUUID(),
      policyId: cmd.policyId,
      policyNumber: policy.policyNumber,
      incidentDate: cmd.incidentDate,
      cause: cmd.cause,
      status: "OPEN",
      sumInsured: snapshot.rating.sumInsured,
      reserveAmount: 0,
      settledAmount: 0,
    };
    await this.repo.create(claim);
    return claim;
  }

  async setReserve(cmd: { claimId: string; amount: number }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.status === "SETTLED") {
      throw new ServiceError("claim is already settled", "CONFLICT");
    }
    this.withinCover(cmd.amount, claim.sumInsured, "reserve");
    claim.reserveAmount = cmd.amount;
    claim.status = "RESERVED";
    await this.repo.save(claim);
    return claim;
  }

  async settle(cmd: { claimId: string; amount: number }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);
    if (claim.status === "SETTLED") {
      throw new ServiceError("claim is already settled", "CONFLICT");
    }
    if (cmd.amount <= 0) {
      throw new ServiceError("settlement must be positive", "BAD_REQUEST");
    }
    this.withinCover(cmd.amount, claim.sumInsured, "settlement");
    claim.settledAmount = cmd.amount;
    claim.status = "SETTLED";
    await this.repo.save(claim);
    return claim;
  }

  async get(claimId: string): Promise<Claim> {
    return this.load(claimId);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private withinCover(amount: number, sumInsured: number, label: string): void {
    if (amount > sumInsured) {
      throw new ServiceError(
        `${label} ${amount} exceeds sum insured ${sumInsured}`,
        "BAD_REQUEST",
      );
    }
  }

  private async load(claimId: string): Promise<Claim> {
    const claim = await this.repo.get(claimId);
    if (!claim) {
      throw new ServiceError(`claim ${claimId} not found`, "NOT_FOUND");
    }
    return claim;
  }
}
