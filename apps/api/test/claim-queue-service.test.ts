import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryAssignmentLogRepository,
  InMemoryClaimsRepository,
  InMemoryHandlersRepository,
  InMemoryPolicyRepository,
} from "@pc-core/adapters";
import type { Handler, MotorRisk } from "@pc-core/ports";
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
let queue: ClaimQueueService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  const claimsRepo = new InMemoryClaimsRepository();
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
