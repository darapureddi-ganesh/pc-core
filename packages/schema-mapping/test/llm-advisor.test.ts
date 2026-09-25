import { describe, it, expect } from "vitest";
import { LlmPolicyMappingAdvisor, dryRunMapping } from "../src/index.js";
import type { LlmClient } from "../src/index.js";

const stubLlm = (reply: string): LlmClient => ({ complete: async () => reply });

const sampleRecords = [
  {
    id: "pol-1",
    number: "BETA-000001",
    productCd: "PRIVATE_CAR",
    productRev: "2026.1",
    state: "issued",
    startDt: "2026-01-01",
    endDt: "2027-01-01",
    riskBlob: JSON.stringify({ vehicle: {} }),
    loggedAt: "2026-01-01T00:00:00.000Z",
    txns: [],
  },
];

const validMappingJson = JSON.stringify({
  fields: {
    policyId: "id",
    policyNumber: "number",
    productCode: "productCd",
    productVersion: "productRev",
    status: "state",
    termFrom: "startDt",
    termTo: "endDt",
    base: "riskBlob",
    baseRecordedAt: "loggedAt",
    transactions: "txns",
  },
  statusValues: { issued: "ISSUED" },
  baseIsJsonEncoded: true,
  transactionFields: { txnType: "kind", effectiveFrom: "effDt", recordedAt: "loggedAt", change: "deltaBlob" },
  transactionChangeIsJsonEncoded: true,
});

describe("LlmPolicyMappingAdvisor", () => {
  it("parses a strict-JSON mapping that dry-runs cleanly against the samples", async () => {
    const advisor = new LlmPolicyMappingAdvisor(stubLlm(validMappingJson));
    const mapping = await advisor.proposeMapping(sampleRecords);
    expect(mapping).not.toBeNull();
    expect(dryRunMapping(sampleRecords, mapping!).valid).toBe(true);
  });

  it("tolerates a model that wraps JSON in prose / code fences", async () => {
    const advisor = new LlmPolicyMappingAdvisor(
      stubLlm(`Here's my proposal:\n\`\`\`json\n${validMappingJson}\n\`\`\``),
    );
    const mapping = await advisor.proposeMapping(sampleRecords);
    expect(mapping).not.toBeNull();
  });

  it("rejects a reply with an invalid status enum value", async () => {
    const bad = JSON.parse(validMappingJson);
    bad.statusValues = { issued: "NOT_A_REAL_STATUS" };
    const advisor = new LlmPolicyMappingAdvisor(stubLlm(JSON.stringify(bad)));
    expect(await advisor.proposeMapping(sampleRecords)).toBeNull();
  });

  it("rejects a reply missing a required field mapping", async () => {
    const bad = JSON.parse(validMappingJson);
    delete bad.fields.policyId;
    const advisor = new LlmPolicyMappingAdvisor(stubLlm(JSON.stringify(bad)));
    expect(await advisor.proposeMapping(sampleRecords)).toBeNull();
  });

  it("rejects a reply where an optional field is present but not a string", () => {
    return Promise.all(
      [
        { insuredName: 42 },
        { cancelledEffectiveFrom: {} },
        { customerId: false },
      ].map(async (badOptional) => {
        const bad = JSON.parse(validMappingJson);
        bad.fields = { ...bad.fields, ...badOptional };
        const advisor = new LlmPolicyMappingAdvisor(stubLlm(JSON.stringify(bad)));
        expect(await advisor.proposeMapping(sampleRecords)).toBeNull();
      }),
    );
  });

  it("degrades to null on a malformed reply", async () => {
    const advisor = new LlmPolicyMappingAdvisor(stubLlm("sorry, I can't do that"));
    expect(await advisor.proposeMapping(sampleRecords)).toBeNull();
  });

  it("degrades to null when the LLM call throws", async () => {
    const throwing: LlmClient = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const advisor = new LlmPolicyMappingAdvisor(throwing);
    expect(await advisor.proposeMapping(sampleRecords)).toBeNull();
  });

  it("returns null immediately with no sample records", async () => {
    const advisor = new LlmPolicyMappingAdvisor(stubLlm(validMappingJson));
    expect(await advisor.proposeMapping([])).toBeNull();
  });
});
