import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ServiceError, type ServiceErrorCode } from "../service/errors.js";
import type { PolicyService } from "../service/policy-service.js";
import type { BillingService } from "../service/billing-service.js";
import type { ClaimsService } from "../service/claims-service.js";

export interface Services {
  policy: PolicyService;
  billing: BillingService;
  claims: ClaimsService;
}

const riskSchema = z.object({
  vehicle: z.object({
    cc: z.number(),
    rtoZone: z.string(),
    age: z.number(),
    idv: z.number().optional(),
    exShowroomPrice: z.number().optional(),
  }),
  policy: z.object({ ncb: z.number() }),
  selectedAddOns: z.array(z.string()),
  coverages: z.object({ tpSelected: z.boolean() }),
  voluntaryDeductible: z.number().optional(),
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

const paymentSchema = z.object({ amount: z.number(), date: z.string() });
const fnolSchema = z.object({ incidentDate: z.string(), cause: z.string() });
const amountSchema = z.object({ amount: z.number() });

const httpStatus = (code: ServiceErrorCode): number =>
  code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;

/** Thin HTTP surface over the lifecycle, billing and claims services. */
export function buildServer(services: Services): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ServiceError) {
      return reply
        .status(httpStatus(err.code))
        .send({ error: err.message, code: err.code });
    }
    const message = err instanceof Error ? err.message : "Bad Request";
    return reply.status(400).send({ error: message });
  });

  const id = (req: { params: unknown }) => (req.params as { id: string }).id;

  // ── policy lifecycle ───────────────────────────────────────────────────
  app.post("/quotes", async (req, reply) => {
    const result = await services.policy.quote(quoteSchema.parse(req.body));
    return reply.status(201).send(result);
  });

  app.post("/policies/:id/bind", async (req) => services.policy.bind(id(req)));

  app.post("/policies/:id/issue", async (req) => {
    const policyId = id(req);
    const policy = await services.policy.issue(policyId);
    // Auto-invoice on issue (full premium, single installment at inception).
    const snapshot = await services.policy.getAsOf(policyId, policy.term.from);
    await services.billing.createInvoice({
      policyId,
      total: snapshot?.rating.total ?? 0,
      plan: "FULL",
      startDate: policy.term.from,
    });
    return policy;
  });

  app.post("/policies/:id/endorsements", async (req) =>
    services.policy.endorse({ policyId: id(req), ...endorseSchema.parse(req.body) }),
  );

  app.post("/policies/:id/cancel", async (req) => {
    const { effectiveFrom } = z
      .object({ effectiveFrom: z.string() })
      .parse(req.body);
    return services.policy.cancel({ policyId: id(req), effectiveFrom });
  });

  app.get("/policies/:id", async (req) => {
    const policyId = id(req);
    const { asOf, systemAsOf } = req.query as {
      asOf?: string;
      systemAsOf?: string;
    };
    if (asOf) {
      const snapshot = await services.policy.getAsOf(policyId, asOf, systemAsOf);
      if (!snapshot) {
        throw new ServiceError("no slice in effect on that date", "NOT_FOUND");
      }
      return snapshot;
    }
    return services.policy.get(policyId);
  });

  // ── billing ──────────────────────────────────────────────────────────────
  app.post("/policies/:id/payments", async (req) =>
    services.billing.recordPayment({
      policyId: id(req),
      ...paymentSchema.parse(req.body),
    }),
  );

  app.get("/policies/:id/billing", async (req) =>
    services.billing.statement(id(req)),
  );

  // ── claims ────────────────────────────────────────────────────────────────
  app.post("/policies/:id/claims", async (req, reply) => {
    const claim = await services.claims.fnol({
      policyId: id(req),
      ...fnolSchema.parse(req.body),
    });
    return reply.status(201).send(claim);
  });

  app.post("/claims/:id/reserve", async (req) =>
    services.claims.setReserve({
      claimId: id(req),
      ...amountSchema.parse(req.body),
    }),
  );

  app.post("/claims/:id/settle", async (req) =>
    services.claims.settle({
      claimId: id(req),
      ...amountSchema.parse(req.body),
    }),
  );

  app.get("/claims/:id", async (req) => services.claims.get(id(req)));

  return app;
}
