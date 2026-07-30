import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { ServiceError, type ServiceErrorCode } from "../service/errors.js";
import type { TenantRegistry, TenantServices } from "../tenants.js";

const riskSchema = z.object({
  vehicle: z.object({
    cc: z.number(),
    rtoZone: z.string(),
    age: z.number(),
    idv: z.number().optional(),
    exShowroomPrice: z.number().optional(),
    registrationNo: z.string().optional(),
    make: z.string().optional(),
    model: z.string().optional(),
  }),
  policy: z.object({ ncb: z.number() }),
  selectedAddOns: z.array(z.string()),
  coverages: z.object({ tpSelected: z.boolean() }),
  voluntaryDeductible: z.number().optional(),
  newVehicle: z.boolean().optional(),
});

const quoteSchema = z.object({
  productCode: z.string(),
  version: z.string().optional(),
  term: z.object({ from: z.string(), to: z.string() }),
  risk: riskSchema,
  insured: z.object({ name: z.string() }).optional(),
  customerId: z.string().optional(),
});

const registerCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
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
const fnolSchema = z.object({
  incidentDate: z.string(),
  cause: z.string(),
  rawIntakeText: z.string().optional(),
});
const amountSchema = z.object({ amount: z.number() });
const classifySchema = z.object({ policyholderId: z.string().optional() });
const overrideSchema = z.object({
  handlerId: z.string(),
  reason: z.string().min(1),
  overrideBy: z.string().min(1),
});
const registerConnectorSchema = z.object({
  name: z.string().min(1),
  policyBaseUrl: z.string().url(),
  /** optional: point claims-AI's IDP extractor at a self-hosted Ollama model
   * for this tenant, instead of the default regex extractor */
  ollamaModel: z.string().optional(),
  ollamaBaseUrl: z.string().url().optional(),
});

const DEFAULT_TENANT = "demo";

const httpStatus = (code: ServiceErrorCode): number =>
  code === "NOT_FOUND" ? 404 : code === "CONFLICT" ? 409 : 400;

/**
 * Thin, tenant-aware, multi-tenant HTTP surface over the lifecycle, billing,
 * claims and document services. Every route resolves its service bundle from
 * either an `Authorization: Bearer <apiKey>` header (real, per-connector auth
 * — the key a company gets back from POST /connectors/register) or, as an
 * unauthenticated convenience for local demos, an `X-Tenant-Id` header
 * (defaulting to "demo"). Route handlers never know whether the resolved
 * tenant's data lives in-process or on the other side of an HTTP call to a
 * connected company's own system.
 */
export function buildServer(registry: TenantRegistry): FastifyInstance {
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

  const services = (req: FastifyRequest): TenantServices => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const apiKey = auth.slice("Bearer ".length);
      const tenant = registry.resolveByApiKey(apiKey);
      if (!tenant) throw new ServiceError("invalid API key", "NOT_FOUND");
      return tenant;
    }

    const tenantId = (req.headers["x-tenant-id"] as string) ?? DEFAULT_TENANT;
    const tenant = registry.resolve(tenantId);
    if (!tenant) {
      throw new ServiceError(`unknown tenant "${tenantId}"`, "NOT_FOUND");
    }
    return tenant;
  };

  // ── platform ─────────────────────────────────────────────────────────────
  app.get("/tenants", async () => registry.list());

  // Self-serve onboarding: point OpenCover at a REST service implementing the
  // policy connector contract and get back a tenant ID + API key. No code
  // change or redeploy on OpenCover's side — this is the "connect my system" door.
  app.post("/connectors/register", async (req, reply) => {
    const { name, policyBaseUrl, ollamaModel, ollamaBaseUrl } =
      registerConnectorSchema.parse(req.body);
    const tenant = registry.registerConnector(
      name,
      policyBaseUrl,
      ollamaModel ? { model: ollamaModel, baseUrl: ollamaBaseUrl } : undefined,
    );
    return reply.status(201).send(tenant);
  });

  // ── customers ────────────────────────────────────────────────────────────
  // The identity that ties a person's history together across renewals,
  // multiple vehicles, and every claim on every one of their policies.
  app.post("/customers", async (req, reply) => {
    const customer = await services(req).customers.register(
      registerCustomerSchema.parse(req.body),
    );
    return reply.status(201).send(customer);
  });

  app.get("/customers", async (req) => services(req).customers.list());

  app.get("/customers/:id", async (req) => services(req).customers.get(id(req)));

  app.get("/customers/:id/history", async (req) =>
    services(req).customers.history(id(req)),
  );

  // ── policy lifecycle ───────────────────────────────────────────────────
  app.post("/quotes", async (req, reply) => {
    const result = await services(req).policy.quote(quoteSchema.parse(req.body));
    return reply.status(201).send(result);
  });

  app.post("/policies/:id/bind", async (req) =>
    services(req).policy.bind(id(req)),
  );

  app.post("/policies/:id/issue", async (req) => {
    const { policy, billing } = services(req);
    const policyId = id(req);
    const issued = await policy.issue(policyId);
    // Auto-invoice on issue (full premium, single installment at inception).
    const snapshot = await policy.getAsOf(policyId, issued.term.from);
    await billing.createInvoice({
      policyId,
      total: snapshot?.rating.total ?? 0,
      plan: "FULL",
      startDate: issued.term.from,
    });
    return issued;
  });

  app.post("/policies/:id/endorsements", async (req) =>
    services(req).policy.endorse({
      policyId: id(req),
      ...endorseSchema.parse(req.body),
    }),
  );

  app.post("/policies/:id/cancel", async (req) => {
    const { effectiveFrom } = z
      .object({ effectiveFrom: z.string() })
      .parse(req.body);
    return services(req).policy.cancel({ policyId: id(req), effectiveFrom });
  });

  app.get("/policies/:id", async (req) => {
    const { policy } = services(req);
    const policyId = id(req);
    const { asOf, systemAsOf } = req.query as {
      asOf?: string;
      systemAsOf?: string;
    };
    if (asOf) {
      const snapshot = await policy.getAsOf(policyId, asOf, systemAsOf);
      if (!snapshot) {
        throw new ServiceError("no slice in effect on that date", "NOT_FOUND");
      }
      return snapshot;
    }
    return policy.get(policyId);
  });

  // ── billing ──────────────────────────────────────────────────────────────
  app.post("/policies/:id/payments", async (req) =>
    services(req).billing.recordPayment({
      policyId: id(req),
      ...paymentSchema.parse(req.body),
    }),
  );

  app.get("/policies/:id/billing", async (req) =>
    services(req).billing.statement(id(req)),
  );

  // ── claims ────────────────────────────────────────────────────────────────
  app.post("/policies/:id/claims", async (req, reply) => {
    const claim = await services(req).claims.fnol({
      policyId: id(req),
      ...fnolSchema.parse(req.body),
    });
    return reply.status(201).send(claim);
  });

  app.post("/claims/:id/reserve", async (req) =>
    services(req).claims.setReserve({
      claimId: id(req),
      ...amountSchema.parse(req.body),
    }),
  );

  app.post("/claims/:id/settle", async (req) =>
    services(req).claims.settle({
      claimId: id(req),
      ...amountSchema.parse(req.body),
    }),
  );

  app.get("/claims/:id", async (req) => services(req).claims.get(id(req)));

  // ── claim queue (triage, assignment, SLA) ──────────────────────────────────
  app.post("/claims/:id/classify", async (req) => {
    const { policyholderId } = classifySchema.parse(req.body ?? {});
    return services(req).claimQueue.classify({ claimId: id(req), policyholderId });
  });

  app.post("/claims/:id/assign", async (req) =>
    services(req).claimQueue.assign(id(req)),
  );

  app.post("/claims/:id/override", async (req) =>
    services(req).claimQueue.override({
      claimId: id(req),
      ...overrideSchema.parse(req.body),
    }),
  );

  app.get("/claims/queue/status", async (req) => services(req).claimQueue.queueStatus());

  // ── documents & reporting ─────────────────────────────────────────────────
  app.get("/policies/:id/documents", async (req) =>
    services(req).documents.availableForms(id(req)),
  );

  app.get("/policies/:id/documents/schedule", async (req, reply) => {
    const html = await services(req).documents.schedule(id(req));
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/policies/:id/documents/certificate", async (req, reply) => {
    const html = await services(req).documents.certificate(id(req));
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/reports/premium-register", async (req, reply) => {
    const csv = await services(req).documents.premiumRegisterCsv();
    return reply.type("text/csv; charset=utf-8").send(csv);
  });

  return app;
}
