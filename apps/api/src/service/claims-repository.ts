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
}

export interface ClaimsRepository {
  create(claim: Claim): Promise<void>;
  get(claimId: string): Promise<Claim | undefined>;
  save(claim: Claim): Promise<void>;
}

export class InMemoryClaimsRepository implements ClaimsRepository {
  private readonly store = new Map<string, Claim>();

  async create(claim: Claim): Promise<void> {
    this.store.set(claim.claimId, structuredClone(claim));
  }
  async get(claimId: string): Promise<Claim | undefined> {
    const found = this.store.get(claimId);
    return found ? structuredClone(found) : undefined;
  }
  async save(claim: Claim): Promise<void> {
    this.store.set(claim.claimId, structuredClone(claim));
  }
}
