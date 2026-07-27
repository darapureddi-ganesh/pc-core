// Local mirrors of the API contract. A shared @pc-core/contracts package of
// pure types would remove this duplication — a clean follow-up.

export interface QuoteInput {
  vehicle: { cc: number; idv: number; rtoZone: string; age: number };
  policy: { ncb: number };
  selectedAddOns: string[];
  coverages: { tpSelected: boolean };
}

export interface Rating {
  productCode: string;
  productVersion: string;
  breakdown: Record<string, number>;
  total: number;
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
