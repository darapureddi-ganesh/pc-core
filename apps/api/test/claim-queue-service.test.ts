import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryAssignmentLogRepository,
  InMemoryClaimsRepository,
  InMemoryHandlersRepository,
  InMemoryPolicyRepository,
} from "@pc-core/adapters";
import type { ClaimsRepository, Handler, MotorRisk } from "@pc-core/ports";
import type { TriageAdvisor, TriageAdvisorResult } from "@pc-core/claims-ai";
import { PolicyService, type QuoteCommand } from "../src/service/policy-service.js";
import { ClaimsService } from "../src/service/claims-service.js";
import { ClaimQueueService } from "../src/service/claim-queue-service.js";

const risk: MotorRisk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};
const quoteCmd: QuoteCommand = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk,
};

const handlers: Handler[] = [
  {
    handlerId: "h-accident",
    name: "Accident Expert",
    expertise: ["MOTOR_ACCIDENT"],
    currentWorkload: 0,
    maxCapacity: 10,
    isAvailable: true,
    avgHandlingDays: 4,
    experienceYears: 5,
  },
  {
    handlerId: "h-generalist",
    name: "Generalist",
    expertise: [],
    currentWorkload: 0,
    maxCapacity: 10,
    isAvailable: true,
    avgHandlingDays: 6,
    experienceYears: 2,
  },
];

let policies: PolicyService;
let claims: ClaimsService;
let claimsRepo: ClaimsRepository;
let queue: ClaimQueueService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  claimsRepo = new InMemoryClaimsRepository();
  claims = new ClaimsService(claimsRepo, policies);
  queue = new ClaimQueueService(
    claimsRepo,
    new InMemoryHandlersRepository(handlers.map((h) => ({ ...h }))),
    new InMemoryAssignmentLogRepository(),
  );
});

async function issuedClaim(cause: string): Promise<string> {
  const { policyId } = await policies.quote(quoteCmd);
  await policies.bind(policyId);
  await policies.issue(policyId);
  const claim = await claims.fnol({ policyId, incidentDate: "2026-03-01", cause });
  return claim.claimId;
}

describe("ClaimQueueService — classification", () => {
  it("classifies an accident claim and computes an SLA deadline", async () => {
    const claimId = await issuedClaim("collision on highway");
    const { claim, ruleApplied } = await queue.classify({ claimId });
    expect(claim.claimType).toBe("MOTOR_ACCIDENT");
    // sum insured is 600k, above the default CRITICAL threshold (500k)
    expect(claim.priority).toBe("CRITICAL");
    expect(ruleApplied).toBeNull();
    expect(claim.slaDeadline).toBe("2026-03-08"); // CRITICAL = 7 day TAT
  });

  it("an urgent keyword overrides priority to CRITICAL", async () => {
    const claimId = await issuedClaim("driver taken to ICU after collision");
    const { claim } = await queue.classify({ claimId });
    expect(claim.priority).toBe("CRITICAL");
    expect(claim.classificationRuleApplied).toBe("urgent_keyword:icu");
  });

  it("throws NOT_FOUND for an unknown claim", async () => {
    await expect(queue.classify({ claimId: "missing" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("ClaimQueueService — assignment", () => {
  it("requires classification before assignment", async () => {
    const claimId = await issuedClaim("collision");
    await expect(queue.assign(claimId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("assigns to the best-scoring handler and logs the recommendation", async () => {
    const claimId = await issuedClaim("collision on highway");
    await queue.classify({ claimId });
    const { claim, recommended } = await queue.assign(claimId);
    expect(recommended.handlerId).toBe("h-accident");
    expect(claim.assignedHandlerId).toBe("h-accident");
  });

  it("lets a manager override the assignment with an audited reason", async () => {
    const claimId = await issuedClaim("collision on highway");
    await queue.classify({ claimId });
    await queue.assign(claimId);
    const overridden = await queue.override({
      claimId,
      handlerId: "h-generalist",
      reason: "accident specialist on leave",
      overrideBy: "manager@pc-core.demo",
    });
    expect(overridden.assignedHandlerId).toBe("h-generalist");
  });

  it("refuses to assign when the only handler is unavailable", async () => {
    const offlineOnly = new ClaimQueueService(
      claimsRepo,
      new InMemoryHandlersRepository([{ ...handlers[0]!, isAvailable: false }]),
      new InMemoryAssignmentLogRepository(),
    );
    const claimId = await issuedClaim("collision on highway");
    await offlineOnly.classify({ claimId });
    await expect(offlineOnly.assign(claimId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("logs the current algorithm recommendation on override, not the previously assigned handler", async () => {
    const assignmentLog = new InMemoryAssignmentLogRepository();
    const auditedQueue = new ClaimQueueService(
      claimsRepo,
      new InMemoryHandlersRepository(handlers.map((h) => ({ ...h }))),
      assignmentLog,
    );
    const claimId = await issuedClaim("collision on highway");
    await auditedQueue.classify({ claimId });
    await auditedQueue.assign(claimId); // algorithm recommends + assigns h-accident

    // First override moves it off the algorithm's pick, onto the generalist.
    await auditedQueue.override({
      claimId,
      handlerId: "h-generalist",
      reason: "accident specialist on leave",
      overrideBy: "manager@pc-core.demo",
    });

    // A second override: the *previously assigned* handler is now h-generalist,
    // but the algorithm still recommends h-accident (best expertise match) —
    // the log must reflect the algorithm's live recommendation, not the stale
    // "previous assignee" the buggy version used to log.
    await auditedQueue.override({
      claimId,
      handlerId: "h-generalist", // reassign to the same handler again
      reason: "confirming assignment after review",
      overrideBy: "manager@pc-core.demo",
    });

    const entries = await assignmentLog.listForClaim(claimId);
    const secondOverride = entries.filter((e) => e.isOverride)[1];
    expect(secondOverride?.recommendedHandlerId).toBe("h-accident");
    expect(secondOverride?.finalHandlerId).toBe("h-generalist");
  });
});

describe("ClaimQueueService — advisory AI triage hint", () => {
  const stubAdvisor = (result: TriageAdvisorResult | null): TriageAdvisor => ({
    advise: async () => result,
  });

  it("attaches an aiTriageHint without changing the deterministic priority/claimType", async () => {
    const advised = new ClaimQueueService(
      claimsRepo,
      new InMemoryHandlersRepository(handlers.map((h) => ({ ...h }))),
      new InMemoryAssignmentLogRepository(),
      undefined,
      stubAdvisor({
        suggestedPriority: "LOW",
        suggestedClaimType: "MOTOR_OTHER",
        rationale: "looks minor",
      }),
    );
    const claimId = await issuedClaim("collision on highway"); // rules say CRITICAL/MOTOR_ACCIDENT
    const { claim } = await advised.classify({ claimId });

    // The rules pipeline's decision is untouched by the model disagreeing.
    expect(claim.priority).toBe("CRITICAL");
    expect(claim.claimType).toBe("MOTOR_ACCIDENT");
    expect(claim.aiTriageHint).toEqual({
      suggestedPriority: "LOW",
      suggestedClaimType: "MOTOR_OTHER",
      rationale: "looks minor",
      agreesWithRules: false,
    });
  });

  it("marks agreesWithRules true when the model's suggestion matches", async () => {
    const advised = new ClaimQueueService(
      claimsRepo,
      new InMemoryHandlersRepository(handlers.map((h) => ({ ...h }))),
      new InMemoryAssignmentLogRepository(),
      undefined,
      stubAdvisor({
        suggestedPriority: "CRITICAL",
        suggestedClaimType: "MOTOR_ACCIDENT",
        rationale: "high value collision",
      }),
    );
    const claimId = await issuedClaim("collision on highway");
    const { claim } = await advised.classify({ claimId });
    expect(claim.aiTriageHint?.agreesWithRules).toBe(true);
  });

  it("leaves aiTriageHint unset when the advisor has no opinion", async () => {
    const advised = new ClaimQueueService(
      claimsRepo,
      new InMemoryHandlersRepository(handlers.map((h) => ({ ...h }))),
      new InMemoryAssignmentLogRepository(),
      undefined,
      stubAdvisor(null),
    );
    const claimId = await issuedClaim("collision on highway");
    const { claim } = await advised.classify({ claimId });
    expect(claim.aiTriageHint).toBeUndefined();
  });

  it("leaves aiTriageHint unset when no advisor is configured at all", async () => {
    const claimId = await issuedClaim("collision on highway");
    const { claim } = await queue.classify({ claimId }); // default beforeEach queue, no advisor
    expect(claim.aiTriageHint).toBeUndefined();
  });
});

describe("ClaimQueueService — queue status", () => {
  it("reports pending vs assigned claims and handler workloads", async () => {
    const claimId = await issuedClaim("collision on highway");
    await queue.classify({ claimId });

    const beforeAssign = await queue.queueStatus();
    expect(beforeAssign.totalPending).toBe(1);
    expect(beforeAssign.totalAssigned).toBe(0);

    await queue.assign(claimId);
    const afterAssign = await queue.queueStatus();
    expect(afterAssign.totalPending).toBe(0);
    expect(afterAssign.totalAssigned).toBe(1);
    const assignedHandler = afterAssign.handlerWorkloads.find(
      (h) => h.handlerId === "h-accident",
    );
    expect(assignedHandler?.currentWorkload).toBe(1);
  });
});
