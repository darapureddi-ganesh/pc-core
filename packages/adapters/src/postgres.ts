import { eq, sql } from "drizzle-orm";
import { schema, type Db } from "@pc-core/db/client";
import type {
  AssignmentLogEntry,
  AssignmentLogRepository,
  BillingAccount,
  BillingRepository,
  Claim,
  ClaimsRepository,
  Customer,
  CustomerRepository,
  Handler,
  HandlersRepository,
  PolicyAggregate,
  PolicyRepository,
} from "@pc-core/ports";

/**
 * Postgres-backed Connector SDK adapters — the same aggregate shape the
 * in-memory adapters hold in a Map, persisted as JSONB so it survives a
 * restart and can live on infra a company actually controls (e.g. for India's
 * data-localization requirement). See packages/db/migrations/0002_jsonb_adapters.sql
 * for the tables, and its comment for why this isn't the normalized
 * policy_period model — that's future work.
 */
export class PostgresPolicyRepository implements PolicyRepository {
  constructor(
    private readonly db: Db,
    private readonly numberPrefix = "PC-2026",
  ) {}

  async create(policy: PolicyAggregate): Promise<void> {
    await this.db.insert(schema.policyStore).values({
      policyId: policy.policyId,
      policyNumber: policy.policyNumber,
      data: policy,
    });
  }

  async get(policyId: string): Promise<PolicyAggregate | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.policyStore)
      .where(eq(schema.policyStore.policyId, policyId));
    return row ? (row.data as PolicyAggregate) : undefined;
  }

  async save(policy: PolicyAggregate): Promise<void> {
    await this.db
      .update(schema.policyStore)
      .set({ policyNumber: policy.policyNumber, data: policy })
      .where(eq(schema.policyStore.policyId, policy.policyId));
  }

  async list(): Promise<PolicyAggregate[]> {
    const rows = await this.db.select().from(schema.policyStore);
    return rows.map((r) => r.data as PolicyAggregate);
  }

  async nextPolicyNumber(): Promise<string> {
    const result = await this.db.execute<{ nextval: string }>(
      sql`select nextval('policy_number_seq') as nextval`,
    );
    const seq = Number(result.rows[0]?.nextval);
    return `${this.numberPrefix}-${String(seq).padStart(6, "0")}`;
  }
}

export class PostgresBillingRepository implements BillingRepository {
  constructor(private readonly db: Db) {}

  async create(account: BillingAccount): Promise<void> {
    await this.db
      .insert(schema.billingStore)
      .values({ policyId: account.policyId, data: account });
  }

  async get(policyId: string): Promise<BillingAccount | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.billingStore)
      .where(eq(schema.billingStore.policyId, policyId));
    return row ? (row.data as BillingAccount) : undefined;
  }

  async save(account: BillingAccount): Promise<void> {
    await this.db
      .update(schema.billingStore)
      .set({ data: account })
      .where(eq(schema.billingStore.policyId, account.policyId));
  }
}

export class PostgresClaimsRepository implements ClaimsRepository {
  constructor(private readonly db: Db) {}

  async create(claim: Claim): Promise<void> {
    await this.db.insert(schema.claimStore).values({
      claimId: claim.claimId,
      policyId: claim.policyId,
      data: claim,
    });
  }

  async get(claimId: string): Promise<Claim | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.claimStore)
      .where(eq(schema.claimStore.claimId, claimId));
    return row ? (row.data as Claim) : undefined;
  }

  async save(claim: Claim): Promise<void> {
    await this.db
      .update(schema.claimStore)
      .set({ data: claim })
      .where(eq(schema.claimStore.claimId, claim.claimId));
  }

  async list(): Promise<Claim[]> {
    const rows = await this.db.select().from(schema.claimStore);
    return rows.map((r) => r.data as Claim);
  }
}

export class PostgresHandlersRepository implements HandlersRepository {
  constructor(private readonly db: Db) {}

  async list(): Promise<Handler[]> {
    const rows = await this.db.select().from(schema.handlerStore);
    return rows.map((r) => r.data as Handler);
  }

  async get(handlerId: string): Promise<Handler | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.handlerStore)
      .where(eq(schema.handlerStore.handlerId, handlerId));
    return row ? (row.data as Handler) : undefined;
  }

  async save(handler: Handler): Promise<void> {
    await this.db
      .insert(schema.handlerStore)
      .values({ handlerId: handler.handlerId, data: handler })
      .onConflictDoUpdate({
        target: schema.handlerStore.handlerId,
        set: { data: handler },
      });
  }
}

export class PostgresAssignmentLogRepository implements AssignmentLogRepository {
  constructor(private readonly db: Db) {}

  async append(entry: AssignmentLogEntry): Promise<void> {
    await this.db
      .insert(schema.assignmentLogStore)
      .values({ claimId: entry.claimId, createdAt: new Date(entry.createdAt), data: entry });
  }

  async listForClaim(claimId: string): Promise<AssignmentLogEntry[]> {
    const rows = await this.db
      .select()
      .from(schema.assignmentLogStore)
      .where(eq(schema.assignmentLogStore.claimId, claimId));
    return rows.map((r) => r.data as AssignmentLogEntry);
  }
}

export class PostgresCustomerRepository implements CustomerRepository {
  constructor(private readonly db: Db) {}

  async create(customer: Customer): Promise<void> {
    await this.db
      .insert(schema.customerStore)
      .values({ customerId: customer.customerId, data: customer });
  }

  async get(customerId: string): Promise<Customer | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.customerStore)
      .where(eq(schema.customerStore.customerId, customerId));
    return row ? (row.data as Customer) : undefined;
  }

  async save(customer: Customer): Promise<void> {
    await this.db
      .update(schema.customerStore)
      .set({ data: customer })
      .where(eq(schema.customerStore.customerId, customer.customerId));
  }

  async list(): Promise<Customer[]> {
    const rows = await this.db.select().from(schema.customerStore);
    return rows.map((r) => r.data as Customer);
  }
}
