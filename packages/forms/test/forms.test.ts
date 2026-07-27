import { describe, it, expect } from "vitest";
import {
  renderPolicySchedule,
  renderForm51,
  renderPremiumRegisterCsv,
  esc,
  type ScheduleData,
  type CertificateData,
} from "../src/index.js";

const schedule: ScheduleData = {
  policyNumber: "PC-2026-000001",
  insuredName: "A. Sharma",
  product: "PRIVATE_CAR",
  productVersion: "2026.1",
  vehicle: {
    registrationNo: "KA01AB1234",
    description: "Hatchback",
    cc: 1200,
    idv: 600_000,
    rtoZone: "A",
  },
  period: { from: "2026-01-01", to: "2027-01-01" },
  ncb: 25,
  coverages: [
    { name: "Own Damage", detail: "IDV ₹6,00,000.00" },
    { name: "Third-Party Liability", detail: "Statutory" },
  ],
  premium: {
    lines: [
      { label: "OD net", amount: 14175 },
      { label: "Third-party", amount: 3416 },
      { label: "GST 18%", amount: 3301.38 },
    ],
    total: 21642.38,
  },
};

describe("policy schedule", () => {
  it("renders the key policy facts", () => {
    const html = renderPolicySchedule(schedule);
    expect(html).toContain("PC-2026-000001");
    expect(html).toContain("A. Sharma");
    expect(html).toContain("KA01AB1234");
    expect(html).toContain("₹21,642.38");
    expect(html).toContain("SPECIMEN");
  });
});

describe("Form 51 certificate", () => {
  const cert: CertificateData = {
    certificateNumber: "PC-2026-000001",
    policyNumber: "PC-2026-000001",
    insuredName: "A. Sharma",
    vehicle: { registrationNo: "KA01AB1234", description: "Hatchback" },
    period: { from: "2026-01-01", to: "2027-01-01" },
    tp: { propertyDamage: "₹7,50,000", bodilyInjury: "As per the Motor Vehicles Act" },
    issuedAt: "2026-01-01T00:00:00Z",
  };

  it("renders the statutory certificate fields", () => {
    const html = renderForm51(cert);
    expect(html).toContain("Certificate of Insurance (Form 51)");
    expect(html).toContain("KA01AB1234");
    expect(html).toContain("Persons or classes of persons entitled to drive");
  });
});

describe("premium register (IRDAI-style)", () => {
  it("emits a CSV header even with no rows", () => {
    expect(renderPremiumRegisterCsv([])).toBe(
      "policyNumber,product,inception,expiry,sumInsured,odPremium,tpPremium,gst,total",
    );
  });

  it("emits one row per policy", () => {
    const csv = renderPremiumRegisterCsv([
      {
        policyNumber: "PC-2026-000001",
        product: "PRIVATE_CAR",
        inception: "2026-01-01",
        expiry: "2027-01-01",
        sumInsured: 600_000,
        odPremium: 14175,
        tpPremium: 3416,
        gst: 3301.38,
        total: 21642.38,
      },
    ]);
    const rows = csv.trim().split("\n");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain("PC-2026-000001");
  });
});

describe("escaping", () => {
  it("escapes HTML metacharacters", () => {
    expect(esc('<script>&"')).toBe("&lt;script&gt;&amp;&quot;");
  });
});
