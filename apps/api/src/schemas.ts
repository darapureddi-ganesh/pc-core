import { z } from "zod";

/**
 * Validates a `PolicyEnvelopeMapping` (see `@pc-core/schema-mapping`).
 * Shared between the HTTP layer (a company's confirmed mapping arriving via
 * `POST /connectors/register`) and `TenantRegistry.hydrate()` (the same
 * mapping read back from durable storage on boot) — one schema, so what we
 * accept from a request and what we trust from the database are validated
 * identically, never diverging.
 */
export const policyFieldMappingSchema = z.object({
  fields: z.object({
    policyId: z.string(),
    policyNumber: z.string(),
    productCode: z.string(),
    productVersion: z.string(),
    status: z.string(),
    termFrom: z.string(),
    termTo: z.string(),
    base: z.string(),
    baseRecordedAt: z.string(),
    transactions: z.string(),
    insuredName: z.string().optional(),
    cancelledEffectiveFrom: z.string().optional(),
    customerId: z.string().optional(),
    renewedFromPolicyId: z.string().optional(),
  }),
  statusValues: z.record(z.enum(["QUOTED", "BOUND", "ISSUED", "CANCELLED"])),
  baseIsJsonEncoded: z.boolean().optional(),
  transactionFields: z.object({
    txnType: z.string(),
    effectiveFrom: z.string(),
    recordedAt: z.string(),
    change: z.string(),
  }),
  transactionChangeIsJsonEncoded: z.boolean().optional(),
});
