import type { ClaimType, Complexity, Priority } from "@pc-core/claims-queue";

export type ClaimStatus = "OPEN" | "RESERVED" | "SETTLED";

export interface Claim {
  claimId: string;
  policyId: string;
  policyNumber: string | null;
  incidentDate: string;
  cause: string;
  status: ClaimStatus;
  /** sum insured in force on the incident date (from the as-of reconstruction) */
  sumInsured: number;
  reserveAmount: number;
  settledAmount: number;
  /** fields the IDP extractor pulled from raw intake text/documents, if any */
  extractedFields?: Record<string, string>;
  /** heuristic fraud score in [0, 1], computed at FNOL against the tenant's claim history */
  fraudScore?: number;
  fraudSignals?: string[];

  // ── triage / queue (set by ClaimQueueService.classify, see @pc-core/claims-queue) ──
  claimType?: ClaimType;
  priority?: Priority;
  complexity?: Complexity;
  predictedHandlingDays?: number;
  slaDeadline?: string;
  slaRiskScore?: number;
  slaBreached?: boolean;
  /** which rule (if any) overrode the classification baseline — audit trail */
  classificationRuleApplied?: string | null;
  /** advisory only — a local model's suggested priority/type + rationale, for
   * a reviewer to compare against the deterministic classification above.
   * Never applied automatically; absent when no TriageAdvisor is configured
   * or it had no opinion (see ClaimQueueService.classify). */
  aiTriageHint?: {
    suggestedPriority: string;
    suggestedClaimType: string;
    rationale: string;
    /** whether the model's suggestion matches the rules pipeline's own priority + claimType */
    agreesWithRules: boolean;
  };

  // ── assignment (set by ClaimQueueService.assign / .override) ──
  assignedHandlerId?: string;
}

/** The claims storage contract — part of the Connector SDK. `list()` lets the
 * fraud-scoring service compare a new claim against the tenant's history. */
export interface ClaimsRepository {
  create(claim: Claim): Promise<void>;
  get(claimId: string): Promise<Claim | undefined>;
  save(claim: Claim): Promise<void>;
  list(): Promise<Claim[]>;
}

export type {
  Handler,
  HandlersRepository,
  AssignmentLogEntry,
  AssignmentLogRepository,
} from "@pc-core/claims-queue";
