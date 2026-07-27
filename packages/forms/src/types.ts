export interface CoverageLine {
  name: string;
  detail: string;
}

export interface PremiumLine {
  label: string;
  amount: number;
}

export interface ScheduleData {
  policyNumber: string;
  insuredName: string;
  product: string;
  productVersion: string;
  vehicle: {
    registrationNo: string;
    description: string;
    cc: number;
    idv: number;
    rtoZone: string;
  };
  period: { from: string; to: string };
  ncb: number;
  coverages: CoverageLine[];
  premium: { lines: PremiumLine[]; total: number };
}

export interface CertificateData {
  certificateNumber: string;
  policyNumber: string;
  insuredName: string;
  vehicle: { registrationNo: string; description: string };
  period: { from: string; to: string };
  tp: { propertyDamage: string; bodilyInjury: string };
  issuedAt: string;
}

export interface RegisterRow {
  policyNumber: string;
  product: string;
  inception: string;
  expiry: string;
  sumInsured: number;
  odPremium: number;
  tpPremium: number;
  gst: number;
  total: number;
}
