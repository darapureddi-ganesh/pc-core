import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  customType,
  jsonb,
  serial,
} from "drizzle-orm/pg-core";

/**
 * Postgres `daterange` — drizzle has no first-class range column, so we declare
 * it. Stored as the literal range text, e.g. `[2026-01-01,2027-01-01)`.
 */
const daterange = customType<{ data: string }>({
  dataType() {
    return "daterange";
  },
});

/**
 * Persistence layer for the temporal domain model.
 *
 * Drizzle describes the columns; the GiST exclusion constraint that actually
 * enforces "no two ISSUED slices of one policy may overlap in time" lives in
 * the raw migration (drizzle has no first-class EXCLUDE). See
 * migrations/0001_policy_period.sql — that constraint is the whole point.
 *
 * Note: the domain package reconstructs timelines as pure functions and needs
 * no database. This schema is how those slices are stored and queried as-of.
 */

export const policy = pgTable("policy", {
  policyId: uuid("policy_id").defaultRandom().primaryKey(),
  policyNumber: text("policy_number").notNull().unique(),
  productCode: text("product_code").notNull(),
  inceptionDate: timestamp("inception_date", { withTimezone: true }).notNull(),
  status: text("status").notNull(), // active | lapsed | cancelled
});

export const policyPeriod = pgTable("policy_period", {
  periodId: uuid("period_id").defaultRandom().primaryKey(),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => policy.policyId),
  txnType: text("txn_type").notNull(), // NEW | ENDORSE | RENEW | CANCEL
  effective: daterange("effective").notNull(), // business validity, half-open
  status: text("status").notNull(), // QUOTED | BOUND | ISSUED | SUPERSEDED
  productCode: text("product_code").notNull(),
  productVersion: text("product_version").notNull(), // pins the rated metadata
  contentHash: text("content_hash").notNull(), // hash of that product version
  writtenPremium: numeric("written_premium", { precision: 14, scale: 2 }),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(), // system-time axis
});

/**
 * Pragmatic JSONB-backed storage for the Connector SDK ports (policy, billing,
 * claims, claim-queue handlers/audit log). Each row holds the same aggregate
 * shape the in-memory adapters hold in a Map — this is "the in-memory adapter,
 * but durable," not a normalized model. It does NOT get the GiST no-overlap
 * guarantee `policy`/`policy_period` above provide; that's future work
 * (materializing the transaction log into `policy_period` rows). This is the
 * fast path to a real, restart-surviving Postgres store for a pilot.
 */

export const policyStore = pgTable("policy_store", {
  policyId: uuid("policy_id").primaryKey(),
  policyNumber: text("policy_number").unique(),
  data: jsonb("data").notNull(), // the full PolicyAggregate
});

export const policyNumberSeq = pgTable("policy_number_seq", {
  id: serial("id").primaryKey(),
});

export const billingStore = pgTable("billing_store", {
  policyId: uuid("policy_id").primaryKey(),
  data: jsonb("data").notNull(), // the full BillingAccount
});

export const claimStore = pgTable("claim_store", {
  claimId: uuid("claim_id").primaryKey(),
  policyId: uuid("policy_id").notNull(),
  data: jsonb("data").notNull(), // the full Claim
});

export const handlerStore = pgTable("handler_store", {
  handlerId: text("handler_id").primaryKey(),
  data: jsonb("data").notNull(), // the full Handler
});

export const assignmentLogStore = pgTable("assignment_log_store", {
  id: serial("id").primaryKey(),
  claimId: uuid("claim_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  data: jsonb("data").notNull(), // the full AssignmentLogEntry
});
