import { describe, it, expect } from "vitest";
import {
  RegexDocumentExtractor,
  HeuristicFraudScorer,
  LlmDocumentExtractor,
  LlmFraudScorer,
  LlmTriageAdvisor,
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

describe("LlmFraudScorer — the real-model seam", () => {
  it("parses a strict-JSON score and signals from the model", async () => {
    const llm = stubLlm(
      '{"score":0.7,"signals":["claim filed the same week as a large IDV increase"]}',
    );
    const result = await new LlmFraudScorer(llm).score({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 40,
    });
    expect(result.score).toBe(0.7);
    expect(result.signals).toEqual([
      "claim filed the same week as a large IDV increase",
    ]);
  });

  it("tolerates a model that wraps JSON in prose / code fences", async () => {
    const llm = stubLlm('Here is my assessment:\n```json\n{"score":0.2,"signals":[]}\n```');
    const result = await new LlmFraudScorer(llm).score({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 100,
    });
    expect(result.score).toBe(0.2);
  });

  it("clamps an out-of-range score into 0..1", async () => {
    const llm = stubLlm('{"score":1.5,"signals":[]}');
    const result = await new LlmFraudScorer(llm).score({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 100,
    });
    expect(result.score).toBe(1);
  });

  it("falls back to the deterministic heuristic on a malformed reply", async () => {
    const result = await new LlmFraudScorer(stubLlm("not JSON at all")).score({
      priorClaimsOnPolicy: 0,
      daysSincePolicyStart: 5,
    });
    expect(result.score).toBeCloseTo(0.3, 5); // same as HeuristicFraudScorer
    expect(result.signals).toContain("incident within 15 days of policy inception");
  });

  it("falls back to the deterministic heuristic when the LLM call throws", async () => {
    const throwing: LlmClient = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const result = await new LlmFraudScorer(throwing).score({
      priorClaimsOnPolicy: 2,
      daysSincePolicyStart: 100,
    });
    expect(result.score).toBeCloseTo(0.5, 5); // same as HeuristicFraudScorer
  });
});

describe("LlmTriageAdvisor — the advisory-only real-model seam", () => {
  it("parses a strict-JSON suggestion from the model", async () => {
    const llm = stubLlm(
      '{"suggestedPriority":"HIGH","suggestedClaimType":"MOTOR_ACCIDENT","rationale":"mentions injury"}',
    );
    const advice = await new LlmTriageAdvisor(llm).advise({
      description: "collision, driver injured",
      amount: 150_000,
    });
    expect(advice).toEqual({
      suggestedPriority: "HIGH",
      suggestedClaimType: "MOTOR_ACCIDENT",
      rationale: "mentions injury",
    });
  });

  it("tolerates a model that wraps JSON in prose / code fences", async () => {
    const llm = stubLlm(
      'Sure:\n```json\n{"suggestedPriority":"LOW","suggestedClaimType":"MOTOR_OTHER","rationale":"minor"}\n```',
    );
    const advice = await new LlmTriageAdvisor(llm).advise({
      description: "scratch",
      amount: 5_000,
    });
    expect(advice?.suggestedPriority).toBe("LOW");
  });

  it("rejects a suggestion outside the rules pipeline's own enum values", async () => {
    const llm = stubLlm(
      '{"suggestedPriority":"URGENT","suggestedClaimType":"MOTOR_ACCIDENT","rationale":"x"}',
    );
    const advice = await new LlmTriageAdvisor(llm).advise({
      description: "collision",
      amount: 10_000,
    });
    expect(advice).toBeNull();
  });

  it("degrades to no opinion on a malformed reply", async () => {
    const advice = await new LlmTriageAdvisor(stubLlm("not JSON")).advise({
      description: "collision",
      amount: 10_000,
    });
    expect(advice).toBeNull();
  });

  it("degrades to no opinion when the LLM call throws", async () => {
    const throwing: LlmClient = {
      complete: async () => {
        throw new Error("provider down");
      },
    };
    const advice = await new LlmTriageAdvisor(throwing).advise({
      description: "collision",
      amount: 10_000,
    });
    expect(advice).toBeNull();
  });
});
