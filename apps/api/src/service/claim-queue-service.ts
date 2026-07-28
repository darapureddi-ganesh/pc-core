import {
  classifyClaim,
  computeSla,
  rankHandlers,
  DEFAULT_COMPANY_RULES,
  type CompanyRules,
  type HandlerScore,
} from "@pc-core/claims-queue";
import type {
  AssignmentLogRepository,
  Claim,
  ClaimsRepository,
  HandlersRepository,
} from "@pc-core/ports";
import { ServiceError } from "./errors.js";

export interface HandlerWorkload {
  handlerId: string;
  name: string;
  currentWorkload: number;
  maxCapacity: number;
  /** currentWorkload / maxCapacity, as a 0..1 fraction (not a 0..100 percentage) */
  utilizationRatio: number;
}

export interface QueueStatus {
  totalPending: number;
  totalAssigned: number;
  slaBreachAlerts: number;
  avgSlaRisk: number;
  pendingClaims: Claim[];
  handlerWorkloads: HandlerWorkload[];
}

export interface ClassifyResult {
  claim: Claim;
  baselinePriority: Claim["priority"];
  baselineClaimType: Claim["claimType"];
  ruleApplied: string | null;
}

export interface AssignResult {
  claim: Claim;
  recommended: HandlerScore;
  candidates: HandlerScore[];
}

/**
 * Triage & routing for claims already on file (the queue side of claims — FNOL,
 * reserve and settle stay in ClaimsService). Classification is a deterministic
 * rules pipeline (see @pc-core/claims-queue — no hosted ML, same stance as the
 * fraud scorer), transparent about baseline vs. company-rule overrides.
 * Assignment is weighted scoring over handler expertise/workload/speed, with
 * every recommendation and manual override written to an audit log
 * (IRDAI requires the reviewer identity + reason on any override).
 */
export class ClaimQueueService {
  constructor(
    private readonly claims: ClaimsRepository,
    private readonly handlers: HandlersRepository,
    private readonly assignmentLog: AssignmentLogRepository,
    private readonly rules: CompanyRules = DEFAULT_COMPANY_RULES,
  ) {}

  async classify(cmd: {
    claimId: string;
    policyholderId?: string;
    now?: Date;
  }): Promise<ClassifyResult> {
    const claim = await this.load(cmd.claimId);

    const result = classifyClaim(
      { description: claim.cause, amount: claim.sumInsured, policyholderId: cmd.policyholderId },
      this.rules,
    );
    const sla = computeSla(claim.incidentDate, result.priority, cmd.now);

    claim.claimType = result.claimType;
    claim.priority = result.priority;
    claim.complexity = result.complexity;
    claim.predictedHandlingDays = result.predictedHandlingDays;
    claim.classificationRuleApplied = result.ruleApplied;
    claim.slaDeadline = sla.slaDeadline;
    claim.slaRiskScore = sla.slaRiskScore;
    claim.slaBreached = sla.slaBreached;

    await this.claims.save(claim);
    return {
      claim,
      baselinePriority: result.baselinePriority,
      baselineClaimType: result.baselineClaimType,
      ruleApplied: result.ruleApplied,
    };
  }

  async assign(claimId: string): Promise<AssignResult> {
    const claim = await this.load(claimId);
    if (!claim.claimType) {
      throw new ServiceError("claim must be classified before assignment", "CONFLICT");
    }

    const handlers = await this.handlers.list();
    const candidates = rankHandlers(claim.claimType, handlers);
    const recommended = candidates[0];
    if (!recommended) {
      throw new ServiceError("no handlers configured", "NOT_FOUND");
    }
    if (!recommended.availability) {
      throw new ServiceError("no available handler to assign this claim to", "CONFLICT");
    }

    await this.applyAssignment(claim, recommended.handlerId);
    await this.assignmentLog.append({
      claimId: claim.claimId,
      recommendedHandlerId: recommended.handlerId,
      finalHandlerId: recommended.handlerId,
      confidenceScore: recommended.score,
      isOverride: false,
      createdAt: new Date().toISOString(),
    });

    return { claim, recommended, candidates };
  }

  async override(cmd: {
    claimId: string;
    handlerId: string;
    reason: string;
    overrideBy: string;
  }): Promise<Claim> {
    const claim = await this.load(cmd.claimId);

    const target = await this.handlers.get(cmd.handlerId);
    if (!target) {
      throw new ServiceError(`handler ${cmd.handlerId} not found`, "NOT_FOUND");
    }

    let algorithmRecommendation: string | null = null;
    if (claim.claimType) {
      const handlers = await this.handlers.list();
      algorithmRecommendation = rankHandlers(claim.claimType, handlers)[0]?.handlerId ?? null;
    }

    await this.applyAssignment(claim, cmd.handlerId);
    await this.assignmentLog.append({
      claimId: claim.claimId,
      recommendedHandlerId: algorithmRecommendation,
      finalHandlerId: cmd.handlerId,
      confidenceScore: 1,
      isOverride: true,
      overrideReason: cmd.reason,
      overrideBy: cmd.overrideBy,
      createdAt: new Date().toISOString(),
    });

    return claim;
  }

  async queueStatus(asOf: Date = new Date()): Promise<QueueStatus> {
    const claims = await this.claims.list();
    const handlers = await this.handlers.list();

    const withLiveSla = claims.map((claim) => {
      if (!claim.priority) return claim;
      const sla = computeSla(claim.incidentDate, claim.priority, asOf);
      return { ...claim, slaRiskScore: sla.slaRiskScore, slaBreached: sla.slaBreached };
    });

    const pendingClaims = withLiveSla.filter((c) => !c.assignedHandlerId);
    const scored = withLiveSla.filter((c) => c.slaRiskScore !== undefined);

    return {
      totalPending: pendingClaims.length,
      totalAssigned: withLiveSla.filter((c) => c.assignedHandlerId).length,
      slaBreachAlerts: withLiveSla.filter((c) => c.slaBreached).length,
      avgSlaRisk: scored.length
        ? scored.reduce((sum, c) => sum + (c.slaRiskScore ?? 0), 0) / scored.length
        : 0,
      pendingClaims,
      handlerWorkloads: handlers.map((h) => ({
        handlerId: h.handlerId,
        name: h.name,
        currentWorkload: h.currentWorkload,
        maxCapacity: h.maxCapacity,
        utilizationRatio: h.maxCapacity ? h.currentWorkload / h.maxCapacity : 0,
      })),
    };
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async applyAssignment(claim: Claim, handlerId: string): Promise<void> {
    const previousHandlerId = claim.assignedHandlerId;
    if (previousHandlerId && previousHandlerId !== handlerId) {
      const previous = await this.handlers.get(previousHandlerId);
      if (previous) {
        previous.currentWorkload = Math.max(0, previous.currentWorkload - 1);
        await this.handlers.save(previous);
      }
    }
    if (previousHandlerId !== handlerId) {
      const next = await this.handlers.get(handlerId);
      if (next) {
        next.currentWorkload += 1;
        await this.handlers.save(next);
      }
    }
    claim.assignedHandlerId = handlerId;
    await this.claims.save(claim);
  }

  private async load(claimId: string): Promise<Claim> {
    const claim = await this.claims.get(claimId);
    if (!claim) {
      throw new ServiceError(`claim ${claimId} not found`, "NOT_FOUND");
    }
    return claim;
  }
}
