import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  PolicyError,
  type PolicyErrorCode,
  type PolicyService,
} from "../service/policy-service.js";

const riskSchema = z.object({
  vehicle: z.object({
    cc: z.number(),
    idv: z.number(),
    rtoZone: z.string(),
    age: z.number(),
  }),
  policy: z.object({ ncb: z.number() }),
  selectedAddOns: z.array(z.string()),
  coverages: z.object({ tpSelected: z.boolean() }),
});

const quoteSchema = z.object({
  productCode: z.string(),
  version: z.string().optional(),
  term: z.object({ from: z.string(), to: z.string() }),
  risk: riskSchema,
});

const changeSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setIdv"), idv: z.number() }),
  z.object({ op: z.literal("setNcb"), ncb: z.number() }),
  z.object({ op: z.literal("addAddOn"), code: z.string() }),
  z.object({ op: z.literal("removeAddOn"), code: z.string() }),
]);

const endorseSchema = z.object({
  effectiveFrom: z.string(),
  change: changeSchema,
  recordedAt: z.string().optional(),
});

const httpStatus = (code: PolicyErrorCode): number =>
  code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;

/** Thin HTTP surface over the lifecycle service. */
export function buildServer(service: PolicyService): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PolicyError) {
      return reply
        .status(httpStatus(err.code))
        .send({ error: err.message, code: err.code });
    }
    // schema-validation and everything else
    const message = err instanceof Error ? err.message : "Bad Request";
    return reply.status(400).send({ error: message });
  });

  app.post("/quotes", async (req, reply) => {
    const cmd = quoteSchema.parse(req.body);
    const result = await service.quote(cmd);
    return reply.status(201).send(result);
  });

  app.post("/policies/:id/bind", async (req) => {
    const { id } = req.params as { id: string };
    return service.bind(id);
  });

  app.post("/policies/:id/issue", async (req) => {
    const { id } = req.params as { id: string };
    return service.issue(id);
  });

  app.post("/policies/:id/endorsements", async (req) => {
    const { id } = req.params as { id: string };
    const body = endorseSchema.parse(req.body);
    return service.endorse({ policyId: id, ...body });
  });

  app.post("/policies/:id/cancel", async (req) => {
    const { id } = req.params as { id: string };
    const { effectiveFrom } = z
      .object({ effectiveFrom: z.string() })
      .parse(req.body);
    return service.cancel({ policyId: id, effectiveFrom });
  });

  app.get("/policies/:id", async (req) => {
    const { id } = req.params as { id: string };
    const { asOf, systemAsOf } = req.query as {
      asOf?: string;
      systemAsOf?: string;
    };
    if (asOf) {
      const snapshot = await service.getAsOf(id, asOf, systemAsOf);
      if (!snapshot) {
        throw new PolicyError("no slice in effect on that date", "NOT_FOUND");
      }
      return snapshot;
    }
    return service.get(id);
  });

  return app;
}
