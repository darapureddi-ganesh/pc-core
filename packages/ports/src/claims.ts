import type { ClaimStage, ClaimType, Complexity, Priority } from "@pc-core/claims-queue";

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
    suggestedPriority: Priority;
    suggestedClaimType: ClaimType;
    rationale: string;
    /** whether the model's suggestion matches the rules pipeline's own priority + claimType */
    agreesWithRules: boolean;
  };

  // ── assignment (set by ClaimQueueService.assign / .override) ──
  assignedHandlerId?: string;

  // ── IRDAI survey workflow (set by ClaimsService; absent on older claims) ──
  /** when the claim was intimated (ISO date-time) — starts the 24 h surveyor clock */
  reportedAt?: string;
  stage?: ClaimStage;
  surveyor?: { name: string; appointedAt: string; reportAt?: string; assessedAmount?: number };
  /** result of the VAHAN cross-check at FNOL; absent when no registry ran */
  vehicleCheck?: "MATCHED" | "MISMATCH";

  // ── money out and money back (set by ClaimFinanceService) ──
  payments?: ClaimPayment[];
  recovery?: Recovery;

  /** human-readable audit trail of workflow, payment and recovery actions */
  activity?: Array<{ at: string; by: string; text: string }>;
}

export interface ClaimPayment {
  paymentId: string;
  payee: string;
  payeeType: "GARAGE" | "INSURED" | "SURVEYOR" | "CLAIMANT";
  mode: "NEFT" | "IMPS" | "UPI";
  /** masked account (IFSC · xx1234) or the UPI ID */
  destination: string;
  amount: number;
  status: "RELEASED" | "AWAITING_APPROVAL";
  requestedBy: string; // handlerId
  approvedBy?: string; // handlerId
  createdAt: string;
}

/** Subrogation / salvage recovery against an at-fault party or buyer. */
export interface Recovery {
  against: string;
  theirInsurer?: string;
  targetMin: number;
  targetMax: number;
  steps: Array<{ at: string; step: string; amount?: number; note?: string }>;
  settledAmount?: number;
  settledOn?: string;
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
