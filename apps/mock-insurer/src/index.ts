import Fastify from "fastify";
import type { PolicyAggregate } from "@pc-core/ports";
import { toBeta, toContract, type BetaRecord } from "./store.js";

/**
 * A stand-in for "a company's own system" — its own internal schema
 * (see store.ts), fronted by a thin HTTP service implementing pc-core's
 * documented policy connector contract (see
 * @pc-core/adapters RemoteHttpPolicyRepository). This is what a real
 * integration looks like: pc-core never sees Beta's schema, only this
 * boundary.
 */
const app = Fastify({ logger: false });
const table = new Map<string, BetaRecord>();
let seq = 0;

app.post("/policies", async (req, reply) => {
  const policy = req.body as PolicyAggregate;
  table.set(policy.policyId, toBeta(policy));
  return reply.status(201).send();
});

app.get("/policies/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  const record = table.get(id);
  if (!record) return reply.status(404).send();
  return toContract(record);
});

app.put("/policies/:id", async (req) => {
  const { id } = req.params as { id: string };
  const policy = req.body as PolicyAggregate;
  table.set(id, toBeta(policy));
  return {};
});

app.get("/policies", async () => [...table.values()].map(toContract));

app.post("/policies/next-number", async () => {
  seq += 1;
  return { policyNumber: `BETA-${String(seq).padStart(6, "0")}` };
});

// Debug-only: dump Beta's RAW internal records (not the contract shape) so a
// demo can show that pc-core's data really is stored in this system's own
// schema. Not part of the connector contract.
app.get("/_raw", async () => [...table.values()]);

const port = Number(process.env.PORT ?? 4000);
app
  .listen({ port, host: "127.0.0.1" })
  .then((address) =>
    console.log(`mock-insurer (Beta's own system) listening on ${address}`),
  )
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
