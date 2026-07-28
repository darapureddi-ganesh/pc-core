import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { RemoteHttpPolicyRepository } from "../src/index.js";
import type { PolicyAggregate } from "@pc-core/ports";

/**
 * A minimal server satisfying the REST contract documented on
 * RemoteHttpPolicyRepository — standing in for "a company's own system"
 * fronted by a thin HTTP service. Proves the adapter round-trips correctly
 * against a real, separate process reachable only over HTTP.
 */
function buildFakeInsurerServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  const store = new Map<string, PolicyAggregate>();
  let seq = 0;

  app.post("/policies", async (req, reply) => {
    const policy = req.body as PolicyAggregate;
    store.set(policy.policyId, policy);
    return reply.status(201).send();
  });
  app.get("/policies/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const found = store.get(id);
    if (!found) return reply.status(404).send();
    return found;
  });
  app.put("/policies/:id", async (req) => {
    const { id } = req.params as { id: string };
    store.set(id, req.body as PolicyAggregate);
    return {};
  });
  app.get("/policies", async () => [...store.values()]);
  app.post("/policies/next-number", async () => {
    seq += 1;
    return { policyNumber: `BETA-${String(seq).padStart(5, "0")}` };
  });

  return app;
}

const samplePolicy: PolicyAggregate = {
  policyId: "p-1",
  policyNumber: null,
  productCode: "PRIVATE_CAR",
  productVersion: "2026.1",
  status: "QUOTED",
  term: { from: "2026-01-01", to: "2027-01-01" },
  base: {
    vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
    policy: { ncb: 25 },
    selectedAddOns: [],
    coverages: { tpSelected: true },
  },
  baseRecordedAt: "2026-01-01T00:00:00Z",
  transactions: [],
};

let server: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  server = buildFakeInsurerServer();
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = address;
});

afterAll(async () => {
  await server.close();
});

describe("RemoteHttpPolicyRepository — adapting an external system over HTTP", () => {
  it("round-trips create/get/save/list/nextPolicyNumber against a separate real server", async () => {
    const repo = new RemoteHttpPolicyRepository(baseUrl);

    expect(await repo.get("p-1")).toBeUndefined();

    await repo.create(samplePolicy);
    const fetched = await repo.get("p-1");
    expect(fetched?.policyId).toBe("p-1");
    expect(fetched?.status).toBe("QUOTED");

    await repo.save({ ...samplePolicy, status: "BOUND" });
    expect((await repo.get("p-1"))?.status).toBe("BOUND");

    const listed = await repo.list();
    expect(listed).toHaveLength(1);

    const num = await repo.nextPolicyNumber();
    expect(num).toBe("BETA-00001");
  });
});
