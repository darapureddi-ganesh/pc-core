// Local mirrors of the API contract. A shared @pc-core/contracts package of
// pure types would remove this duplication — a clean follow-up.

export interface QuoteInput {
  vehicle: {
    cc: number;
    idv: number;
    rtoZone: string;
    age: number;
    registrationNo?: string;
    make?: string;
    model?: string;
  };
  policy: { ncb: number };
  selectedAddOns: string[];
  coverages: { tpSelected: boolean };
  /** brand-new car, first registration — prices TP as the mandatory 3-year lump sum */
  newVehicle?: boolean;
}

export interface Rating {
  productCode: string;
  productVersion: string;
  breakdown: Record<string, number>;
  total: number;
  sumInsured: number;
  referrals: Array<{ id: string; message: string }>;
  errors: Array<{ id: string; message: string }>;
}

export interface QuoteResult {
  policyId: string;
  rating: Rating;
}

export interface Policy {
  policyId: string;
  policyNumber: string | null;
  productCode: string;
  productVersion: string;
  status: string;
  term: { from: string; to: string };
}

export interface Installment {
  seq: number;
  dueDate: string;
  amount: number;
}

export interface BillingStatement {
  policyId: string;
  plan: string;
  total: number;
  paid: number;
  outstanding: number;
  installments: Installment[];
}

export interface Claim {
  claimId: string;
  policyId: string;
  policyNumber: string | null;
  incidentDate: string;
  cause: string;
  status: string;
  sumInsured: number;
  reserveAmount: number;
  settledAmount: number;
  fraudScore?: number;
  fraudSignals?: string[];
  extractedFields?: Record<string, string>;
  claimType?: string;
  priority?: string;
  complexity?: string;
  predictedHandlingDays?: number;
  slaDeadline?: string;
  slaRiskScore?: number;
  slaBreached?: boolean;
  classificationRuleApplied?: string | null;
  assignedHandlerId?: string;
}

export interface ClassifyResult {
  claim: Claim;
  baselinePriority?: string;
  baselineClaimType?: string;
  ruleApplied: string | null;
}

export interface HandlerScore {
  handlerId: string;
  name: string;
  score: number;
  expertiseMatch: number;
  workloadFactor: number;
  speedFactor: number;
  availability: boolean;
}

export interface AssignResult {
  claim: Claim;
  recommended: HandlerScore;
  candidates: HandlerScore[];
}

export interface HandlerWorkload {
  handlerId: string;
  name: string;
  currentWorkload: number;
  maxCapacity: number;
  utilizationRatio: number;
}

export interface TenantInfo {
  tenantId: string;
  name: string;
}

export interface ConnectorRegistration extends TenantInfo {
  apiKey: string;
}

export interface Customer {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface CustomerHistory {
  customer: Customer;
  policies: Policy[];
  claims: Claim[];
}

export interface QueueStatus {
  totalPending: number;
  totalAssigned: number;
  slaBreachAlerts: number;
  avgSlaRisk: number;
  pendingClaims: Claim[];
  handlerWorkloads: HandlerWorkload[];
}
