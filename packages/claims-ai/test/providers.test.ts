import { describe, it, expect } from "vitest";
import {
  RegexDocumentExtractor,
  HeuristicFraudScorer,
  LlmDocumentExtractor,
  type LlmClient,
} from "../src/index.js";

const stubLlm = (reply: string): LlmClient => ({
  complete: async () => reply,
});

describe("default providers wrap the pure functions", () => {
  it("RegexDocumentExtractor delegates to the regex IDP", async () => {
    const fields = await new RegexDocumentExtractor().extract(
      "vehicle KA01AB1234 estimate ₹45,000",
    );
    expect(fields.registrationNo).toBe("KA01AB1234");
  });

  it("HeuristicFraudScorer delegates to the heuristic scorer", async () => {
    const result = await new HeuristicFraudScorer().score({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 5,
    });
    expect(result.score).toBeCloseTo(0.3, 5);
  });
});

describe("LlmDocumentExtractor — the real-model seam", () => {
  it("parses strict JSON from the model", async () => {
    const llm = stubLlm(
      '{"registrationNo":"KA01AB1234","amount":"₹45,000","dates":["2026-03-01"]}',
    );
    const fields = await new LlmDocumentExtractor(llm).extract("...");
    expect(fields.registrationNo).toBe("KA01AB1234");
    expect(fields.amount).toBe("₹45,000");
    expect(fields.dates).toEqual(["2026-03-01"]);
  });

  it("tolerates a model that wraps JSON in prose / code fences", async () => {
    const llm = stubLlm(
      'Here you go:\n```json\n{"policyNumber":"PC-2026-000001","dates":[]}\n```',
    );
    const fields = await new LlmDocumentExtractor(llm).extract("...");
    expect(fields.policyNumber).toBe("PC-2026-000001");
  });

  it("degrades safely to empty fields on a malformed reply", async () => {
    const fields = await new LlmDocumentExtractor(
      stubLlm("sorry, I can't do that"),
    ).extract("...");
    expect(fields).toEqual({ dates: [] });
  });

  it("degrades safely when the LLM call throws", async () => {
    const throwing: LlmClient = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const fields = await new LlmDocumentExtractor(throwing).extract("...");
    expect(fields).toEqual({ dates: [] });
  });
});
