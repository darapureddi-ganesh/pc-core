import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createDb } from "@pc-core/db/client";
import type { Claim, Customer, Handler, PolicyAggregate } from "@pc-core/ports";
import {
  PostgresAssignmentLogRepository,
  PostgresClaimsRepository,
  PostgresCustomerRepository,
  PostgresHandlersRepository,
  PostgresPolicyRepository,
} from "../src/postgres.js";

/**
 * Runs against a real Postgres with 0002_jsonb_adapters.sql applied. Skipped
 * unless TEST_DATABASE_URL is set — this is an integration test, not part of
 * the default `pnpm test` run, since most contributors won't have Postgres up.
 *
 *   createdb pc_core_test
 *   psql pc_core_test -f packages/db/migrations/0002_jsonb_adapters.sql
 *   TEST_DATABASE_URL=postgres://localhost/pc_core_test pnpm test
 */
const connectionString = process.env.TEST_DATABASE_URL;

describe.skipIf(!connectionString)("Postgres adapters — against a real database", () => {
  const { db, pool } = createDb(connectionString ?? "");

  beforeEach(async () => {
    await pool.query(
      "truncate policy_store, billing_store, claim_store, handler_store, assignment_log_store, customer_store",
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it("round-trips a policy and increments the sequence-backed policy number", async () => {
    const repo = new PostgresPolicyRepository(db, "PC-TEST");
    const policy: PolicyAggregate = {
      policyId: "11111111-1111-1111-1111-111111111111",
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

    await repo.create(policy);
    const fetched = await repo.get(policy.policyId);
    expect(fetched?.status).toBe("QUOTED");

    const bound = { ...policy, status: "BOUND" as const };
    await repo.save(bound);
    expect((await repo.get(policy.policyId))?.status).toBe("BOUND");

    const first = await repo.nextPolicyNumber();
    const second = await repo.nextPolicyNumber();
    expect(first).toMatch(/^PC-TEST-\d{6}$/);
    expect(second).not.toBe(first);

    expect(await repo.list()).toHaveLength(1);
  });

  it("round-trips a claim", async () => {
    const repo = new PostgresClaimsRepository(db);
    const claim: Claim = {
      claimId: "22222222-2222-2222-2222-222222222222",
      policyId: "11111111-1111-1111-1111-111111111111",
      policyNumber: "PC-TEST-000001",
      incidentDate: "2026-03-01",
      cause: "collision",
      status: "OPEN",
      sumInsured: 600_000,
      reserveAmount: 0,
      settledAmount: 0,
    };
    await repo.create(claim);
    expect((await repo.get(claim.claimId))?.cause).toBe("collision");

    await repo.save({ ...claim, status: "RESERVED", reserveAmount: 100_000 });
    const saved = await repo.get(claim.claimId);
    expect(saved?.status).toBe("RESERVED");
    expect(saved?.reserveAmount).toBe(100_000);

    expect(await repo.list()).toHaveLength(1);
  });

  it("upserts a handler (save is idempotent for seeding)", async () => {
    const repo = new PostgresHandlersRepository(db);
    const handler: Handler = {
      handlerId: "h-test",
      name: "Test Handler",
      expertise: ["MOTOR_ACCIDENT"],
      currentWorkload: 0,
      maxCapacity: 10,
      isAvailable: true,
      avgHandlingDays: 5,
      experienceYears: 3,
    };
    await repo.save(handler);
    await repo.save({ ...handler, currentWorkload: 1 }); // re-seed, same id

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.currentWorkload).toBe(1);
  });

  it("appends and lists assignment-log entries for a claim", async () => {
    const repo = new PostgresAssignmentLogRepository(db);
    await repo.append({
      claimId: "22222222-2222-2222-2222-222222222222",
      recommendedHandlerId: "h-test",
      finalHandlerId: "h-test",
      confidenceScore: 0.9,
      isOverride: false,
      createdAt: new Date().toISOString(),
    });
    const entries = await repo.listForClaim("22222222-2222-2222-2222-222222222222");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.finalHandlerId).toBe("h-test");
  });

  it("round-trips a customer", async () => {
    const repo = new PostgresCustomerRepository(db);
    const customer: Customer = {
      customerId: "33333333-3333-3333-3333-333333333333",
      name: "A. Sharma",
      email: "a.sharma@example.com",
      createdAt: "2026-01-01T00:00:00Z",
    };
    await repo.create(customer);
    expect((await repo.get(customer.customerId))?.name).toBe("A. Sharma");

    await repo.save({ ...customer, phone: "+91-9999999999" });
    expect((await repo.get(customer.customerId))?.phone).toBe("+91-9999999999");

    expect(await repo.list()).toHaveLength(1);
  });
});
