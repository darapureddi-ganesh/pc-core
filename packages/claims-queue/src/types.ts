export type ClaimType = "MOTOR_ACCIDENT" | "MOTOR_THEFT" | "MOTOR_OTHER";
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Complexity = "SIMPLE" | "MODERATE" | "COMPLEX";

/** A handler (adjuster) claims can be routed to — part of the Connector SDK. */
export interface Handler {
  handlerId: string;
  name: string;
  /** claim types this handler is rated to work */
  expertise: ClaimType[];
  currentWorkload: number;
  maxCapacity: number;
  isAvailable: boolean;
  avgHandlingDays: number;
  experienceYears: number;
}

/** The handler storage contract — an in-memory default ships in @pc-core/adapters. */
export interface HandlersRepository {
  list(): Promise<Handler[]>;
  get(handlerId: string): Promise<Handler | undefined>;
  save(handler: Handler): Promise<void>;
}

/** IRDAI-audit record of who a claim was assigned to, and any manual override. */
export interface AssignmentLogEntry {
  claimId: string;
  recommendedHandlerId: string | null;
  finalHandlerId: string;
  confidenceScore: number;
  isOverride: boolean;
  overrideReason?: string;
  overrideBy?: string;
  createdAt: string;
}

export interface AssignmentLogRepository {
  append(entry: AssignmentLogEntry): Promise<void>;
  listForClaim(claimId: string): Promise<AssignmentLogEntry[]>;
}
