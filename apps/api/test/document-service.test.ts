import { describe, it, expect, beforeEach } from "vitest";
import {
  PolicyService,
  type QuoteCommand,
} from "../src/service/policy-service.js";
import { InMemoryPolicyRepository } from "../src/service/repository.js";
import { DocumentService } from "../src/service/document-service.js";

const quoteCmd: QuoteCommand = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  insured: { name: "A. Sharma" },
  risk: {
    vehicle: {
      cc: 1200,
      idv: 600_000,
      rtoZone: "A",
      age: 2,
      registrationNo: "KA01AB1234",
      make: "Maruti",
      model: "Swift",
    },
    policy: { ncb: 25 },
    selectedAddOns: ["ZERO_DEP"],
    coverages: { tpSelected: true },
  },
};

let policies: PolicyService;
let documents: DocumentService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  documents = new DocumentService(policies);
});

async function issued(): Promise<string> {
  const { policyId } = await policies.quote(quoteCmd);
  await policies.bind(policyId);
  await policies.issue(policyId);
  return policyId;
}

describe("documents & reporting", () => {
  it("puts the insured, vehicle and premium onto the schedule", async () => {
    const html = await documents.schedule(await issued());
    expect(html).toContain("A. Sharma");
    expect(html).toContain("KA01AB1234");
    expect(html).toContain("Maruti Swift");
    expect(html).toContain("₹21,642.38");
  });

  it("renders a Form 51 certificate with the statutory fields", async () => {
    const html = await documents.certificate(await issued());
    expect(html).toContain("Certificate of Insurance (Form 51)");
    expect(html).toContain("KA01AB1234");
    expect(html).toContain("Persons or classes of persons entitled to drive");
  });

  it("lists the product's forms from config", async () => {
    const forms = await documents.availableForms(await issued());
    expect(forms.map((f) => f.id)).toEqual(["POLICY_SCHEDULE", "FORM_51"]);
  });

  it("refuses to render for a policy that is not issued", async () => {
    const { policyId } = await policies.quote(quoteCmd);
    await expect(documents.schedule(policyId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("includes each issued policy in the premium register", async () => {
    await issued();
    const csv = await documents.premiumRegisterCsv();
    const rows = csv.trim().split("\n");
    expect(rows).toHaveLength(2); // header + one policy
    expect(rows[1]).toContain("600000"); // sum insured
  });
});
