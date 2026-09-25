import { describe, it, expect, vi, afterEach } from "vitest";
import { buildDemoRegistry } from "../src/tenants.js";

const quotePayload = {
  productCode: "PRIVATE_CAR" as const,
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk: {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  },
};

describe("buildDemoRegistry — local model wiring (LOCAL_LLM_* / explicit override)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs the demo tenant's fraud scoring through the configured local model", async () => {
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://localhost:9999/v1/chat/completions");
      const body = JSON.parse(init.body as string) as { messages: { content: string }[] };
      // The fraud prompt mentions "prior claims"; the extraction prompt doesn't.
      const isFraudPrompt = body.messages.some((m) => m.content.includes("prior claims"));
      const content = isFraudPrompt
        ? '{"score":0.9,"signals":["local model: suspicious pattern"]}'
        : '{"dates":[]}';
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const registry = await buildDemoRegistry(undefined, undefined, {
      model: "test-model",
      baseUrl: "http://localhost:9999",
    });
    const demo = registry.resolve("demo");
    if (!demo) throw new Error("demo tenant not registered");

    const { policyId } = await demo.policy.quote(quotePayload);
    await demo.policy.bind(policyId);
    await demo.policy.issue(policyId);

    const claim = await demo.claims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
    });

    expect(claim.fraudScore).toBe(0.9);
    expect(claim.fraudSignals).toContain("local model: suspicious pattern");
    expect(fetchMock).toHaveBeenCalled();
  });

  it("falls back to the deterministic heuristic when the local model call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("down", { status: 503, statusText: "Service Unavailable" })),
    );

    const registry = await buildDemoRegistry(undefined, undefined, {
      model: "test-model",
      baseUrl: "http://localhost:9999",
    });
    const demo = registry.resolve("demo")!;

    const { policyId } = await demo.policy.quote(quotePayload);
    await demo.policy.bind(policyId);
    await demo.policy.issue(policyId);

    const claim = await demo.claims.fnol({
      policyId,
      incidentDate: "2026-01-05", // 4 days after inception -> heuristic flags it
      cause: "collision",
    });

    expect(claim.fraudScore).toBeCloseTo(0.3, 5);
    expect(claim.fraudSignals).toContain("incident within 15 days of policy inception");
  });

  it("uses the built-in deterministic providers when no local model is configured", async () => {
    const registry = await buildDemoRegistry(undefined, undefined, undefined);
    const demo = registry.resolve("demo")!;

    const { policyId } = await demo.policy.quote(quotePayload);
    await demo.policy.bind(policyId);
    await demo.policy.issue(policyId);

    const claim = await demo.claims.fnol({
      policyId,
      incidentDate: "2026-06-01",
      cause: "collision",
    });

    expect(claim.fraudScore).toBe(0);
    expect(claim.fraudSignals).toEqual([]);
  });
});
