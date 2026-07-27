import { randomUUID } from "node:crypto";
import { quote as priceRisk, type RatingResult } from "@pc-core/config-engine";
import {
  asOf,
  buildTimeline,
  type Issue,
  type Transaction,
} from "@pc-core/domain";
import { applyChange } from "./changes.js";
import { resolveProduct } from "./products.js";
import type { PolicyRepository } from "./repository.js";
import type {
  MotorRisk,
  PolicyAggregate,
  PolicySnapshot,
  RiskChange,
} from "./types.js";

export type PolicyErrorCode = "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST";

export class PolicyError extends Error {
  constructor(
    message: string,
    readonly code: PolicyErrorCode,
  ) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface QuoteCommand {
  productCode: string;
  version?: string;
  term: { from: string; to: string };
  risk: MotorRisk;
}

/**
 * The policy lifecycle: quote -> bind -> issue -> endorse -> cancel, plus
 * as-of reconstruction. It orchestrates the two pure packages (config-engine
 * for pricing, domain for the timeline) over a repository port; it holds no
 * pricing or temporal logic of its own.
 */
export class PolicyService {
  constructor(private readonly repo: PolicyRepository) {}

  async quote(
    cmd: QuoteCommand,
  ): Promise<{ policyId: string; rating: RatingResult }> {
    const { product } = resolveProduct(cmd.productCode, cmd.version);
    const rating = priceRisk(product, cmd.risk);

    const policy: PolicyAggregate = {
      policyId: randomUUID(),
      policyNumber: null,
      productCode: product.product,
      productVersion: product.version,
      status: "QUOTED",
      term: { from: cmd.term.from, to: cmd.term.to },
      base: cmd.risk,
      baseRecordedAt: new Date().toISOString(),
      transactions: [],
    };
    await this.repo.create(policy);
    return { policyId: policy.policyId, rating };
  }

  async bind(policyId: string): Promise<PolicyAggregate> {
    const policy = await this.load(policyId);
    this.requireStatus(policy, "QUOTED", "bind");
    policy.status = "BOUND";
    await this.repo.save(policy);
    return policy;
  }

  async issue(policyId: string): Promise<PolicyAggregate> {
    const policy = await this.load(policyId);
    this.requireStatus(policy, "BOUND", "issue");
    policy.status = "ISSUED";
    policy.policyNumber = await this.repo.nextPolicyNumber();
    await this.repo.save(policy);
    return policy;
  }

  async endorse(cmd: {
    policyId: string;
    effectiveFrom: string;
    change: RiskChange;
    recordedAt?: string;
  }): Promise<PolicySnapshot> {
    const policy = await this.load(cmd.policyId);
    this.requireStatus(policy, "ISSUED", "endorse");
    if (
      cmd.effectiveFrom < policy.term.from ||
      cmd.effectiveFrom >= policy.term.to
    ) {
      throw new PolicyError(
        "endorsement effective date is outside the policy term",
        "BAD_REQUEST",
      );
    }

    policy.transactions.push({
      txnType: "ENDORSE",
      effectiveFrom: cmd.effectiveFrom,
      recordedAt: cmd.recordedAt ?? new Date().toISOString(),
      change: cmd.change,
    });
    await this.repo.save(policy);

    const snapshot = this.reconstruct(policy, cmd.effectiveFrom);
    if (!snapshot) {
      throw new PolicyError("no slice at effective date", "BAD_REQUEST");
    }
    return snapshot;
  }

  async cancel(cmd: {
    policyId: string;
    effectiveFrom: string;
  }): Promise<PolicyAggregate> {
    const policy = await this.load(cmd.policyId);
    this.requireStatus(policy, "ISSUED", "cancel");
    policy.status = "CANCELLED";
    policy.cancelledEffectiveFrom = cmd.effectiveFrom;
    await this.repo.save(policy);
    return policy;
  }

  async getAsOf(
    policyId: string,
    date: string,
    systemAsOf?: string,
  ): Promise<PolicySnapshot | undefined> {
    const policy = await this.load(policyId);
    return this.reconstruct(policy, date, systemAsOf);
  }

  async get(policyId: string): Promise<PolicyAggregate> {
    return this.load(policyId);
  }

  // ── internals ────────────────────────────────────────────────────────────

  /**
   * Fold the base risk + endorsement log into a re-rated timeline and return the
   * slice in effect on `date`. Each slice is priced by the engine as it is
   * built, so a backdated endorsement recomputes every downstream slice.
   */
  private reconstruct(
    policy: PolicyAggregate,
    date: string,
    systemAsOf?: string,
  ): PolicySnapshot | undefined {
    const { product } = resolveProduct(policy.productCode, policy.productVersion);
    const price = (risk: MotorRisk): PolicySnapshot => ({
      risk,
      rating: priceRisk(product, risk),
    });

    const issue: Issue<PolicySnapshot> = {
      term: policy.term,
      recordedAt: policy.baseRecordedAt,
      base: price(policy.base),
    };
    const txns: Transaction<PolicySnapshot>[] = policy.transactions.map((t) => ({
      txnType: "ENDORSE",
      effectiveFrom: t.effectiveFrom,
      recordedAt: t.recordedAt,
      apply: (prev) => price(applyChange(prev.risk, t.change)),
    }));

    const timeline = buildTimeline(issue, txns, systemAsOf);
    return asOf(timeline, date)?.snapshot;
  }

  private async load(policyId: string): Promise<PolicyAggregate> {
    const policy = await this.repo.get(policyId);
    if (!policy) {
      throw new PolicyError(`policy ${policyId} not found`, "NOT_FOUND");
    }
    return policy;
  }

  private requireStatus(
    policy: PolicyAggregate,
    status: PolicyAggregate["status"],
    action: string,
  ): void {
    if (policy.status !== status) {
      throw new PolicyError(
        `cannot ${action} a policy in status ${policy.status}`,
        "CONFLICT",
      );
    }
  }
}
