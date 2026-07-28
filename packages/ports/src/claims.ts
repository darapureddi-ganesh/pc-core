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
}

/** The claims storage contract — part of the Connector SDK. `list()` lets the
 * fraud-scoring service compare a new claim against the tenant's history. */
export interface ClaimsRepository {
  create(claim: Claim): Promise<void>;
  get(claimId: string): Promise<Claim | undefined>;
  save(claim: Claim): Promise<void>;
  list(): Promise<Claim[]>;
}
