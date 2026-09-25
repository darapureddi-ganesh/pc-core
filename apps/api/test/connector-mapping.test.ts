import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { InMemoryPolicyRepository } from "@pc-core/adapters";
import { buildServer } from "../src/http/server.js";
import { TenantRegistry } from "../src/tenants.js";

const DEMO_KEY = "pk_test_demo";
const newApp = () =>
  buildServer(
    (() => {
      const registry = new TenantRegistry();
      registry.register(
        { tenantId: "demo", name: "PC Core demo" },
        { policy: new InMemoryPolicyRepository() },
        DEMO_KEY,
      );
      return registry;
    })(),
  );

const quotePayload = {
  productCode: "PRIVATE_CAR",
  term: { from: "2026-01-01", to: "2027-01-01" },
  risk: {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  },
};

/**
 * A stand-in for a real company's own policy service — deliberately storing
 * and returning records in a shape unlike PolicyAggregate (same spirit as
 * apps/mock-insurer's BetaRecord), but WITHOUT any hand-written translation
 * code. That's the point of this whole test: MappedRemoteHttpPolicyRepository
 * does the translating, using a mapping that was PROPOSED by a (stubbed)
 * local model and then confirmed by the caller, never applied blindly.
 */
function buildExternalGammaServer() {
  const app = Fastify({ logger: false });
  const store = new Map<string, Record<string, unknown>>();
  let seq = 0;

  app.post("/policies", async (req, reply) => {
    const record = req.body as Record<string, unknown>;
    store.set(record.id as string, record);
    return reply.status(201).send();
  });
  app.get("/policies/:id", async (req, reply) => {
    const found = store.get((req.params as { id: string }).id);
    return found ?? reply.status(404).send();
  });
  app.put("/policies/:id", async (req) => {
    store.set((req.params as { id: string }).id, req.body as Record<string, unknown>);
    return {};
  });
  app.get("/policies", async () => [...store.values()]);
  app.post("/policies/next-number", async () => {
    seq += 1;
    return { policyNumber: `GAMMA-${String(seq).padStart(5, "0")}` };
  });
  return app;
}

const sampleGammaRecord = {
  id: "sample-1",
  number: "GAMMA-00000",
  productCd: "PRIVATE_CAR",
  productRev: "2026.1",
  state: "issued",
  startDt: "2025-01-01",
  endDt: "2026-01-01",
  insuredNm: "Sample Person",
  riskBlob: JSON.stringify({
    vehicle: { cc: 1000, idv: 500_000, rtoZone: "A", age: 1 },
    policy: { ncb: 0 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  }),
  loggedAt: "2025-01-01T00:00:00.000Z",
  txns: [],
};

const proposedGammaMapping = {
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
    insuredName: "insuredNm",
  },
  statusValues: { quoted: "QUOTED", bound: "BOUND", issued: "ISSUED", cancelled: "CANCELLED" },
  baseIsJsonEncoded: true,
  transactionFields: { txnType: "kind", effectiveFrom: "effDt", recordedAt: "loggedAt", change: "deltaBlob" },
  transactionChangeIsJsonEncoded: true,
};

describe("connector onboarding with an inferred field mapping", () => {
  let externalServer: FastifyInstance;
  let externalBaseUrl: string;

  beforeAll(async () => {
    externalServer = buildExternalGammaServer();
    externalBaseUrl = await externalServer.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => externalServer.close());
  afterEach(() => vi.unstubAllGlobals());

  it("proposes a mapping (via a stubbed local model) that dry-runs cleanly", async () => {
    const realFetch = global.fetch;
    vi.stubGlobal("fetch", (async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/generate")) {
        return new Response(
          JSON.stringify({ response: JSON.stringify(proposedGammaMapping) }),
          { status: 200 },
        );
      }
      return realFetch(url, init);
    }) as typeof fetch);

    const app = newApp();
    const res = await app.inject({
      method: "POST",
      url: "/connectors/propose-mapping",
      payload: { sampleRecords: [sampleGammaRecord], ollamaModel: "llama3.1" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mapping).toEqual(proposedGammaMapping);
    expect(body.dryRun.valid).toBe(true);
    await app.close();
  });

  it("registers a connector with the confirmed mapping and runs the full lifecycle through it, with no hand-written translation code", async () => {
    const app = newApp();

    const reg = await app.inject({
      method: "POST",
      url: "/connectors/register",
      payload: {
        name: "Gamma Insurance",
        policyBaseUrl: externalBaseUrl,
        policyFieldMapping: proposedGammaMapping,
      },
    });
    expect(reg.statusCode).toBe(201);
    const { apiKey } = reg.json();
    const auth = { authorization: `Bearer ${apiKey}` };

    const quoteRes = await app.inject({
      method: "POST",
      url: "/quotes",
      payload: quotePayload,
      headers: auth,
    });
    expect(quoteRes.statusCode).toBe(201);
    const { policyId } = quoteRes.json();

    await app.inject({ method: "POST", url: `/policies/${policyId}/bind`, headers: auth });
    const issueRes = await app.inject({
      method: "POST",
      url: `/policies/${policyId}/issue`,
      headers: auth,
    });
    expect(issueRes.statusCode).toBe(200);
    expect(issueRes.json().policyNumber).toBe("GAMMA-00001");
    expect(issueRes.json().status).toBe("ISSUED"); // translated back from Gamma's lowercase "issued"

    // Fetching it back also goes through the mapping cleanly.
    const getRes = await app.inject({
      method: "GET",
      url: `/policies/${policyId}`,
      headers: auth,
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().status).toBe("ISSUED");

    await app.close();
  });

  it("422s when the model can't propose a usable mapping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ response: "not JSON" }), { status: 200 })),
    );

    const app = newApp();
    const res = await app.inject({
      method: "POST",
      url: "/connectors/propose-mapping",
      payload: { sampleRecords: [sampleGammaRecord], ollamaModel: "llama3.1" },
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
