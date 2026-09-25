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
 * The reference adapter every connector is measured against: what PC Core's
 * own demo tenant uses. A real connector swaps these for something backed by
 * a company's actual database, but the shape — create/get/save(/list) — is
 * exactly this.
 */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly store = new Map<string, PolicyAggregate>();
  private seq = 0;

  constructor(private readonly numberPrefix = "PC-2026") {}

  async create(policy: PolicyAggregate): Promise<void> {
    this.store.set(policy.policyId, structuredClone(policy));
  }

  async get(policyId: string): Promise<PolicyAggregate | undefined> {
    const found = this.store.get(policyId);
    return found ? structuredClone(found) : undefined;
  }

  async save(policy: PolicyAggregate): Promise<void> {
    this.store.set(policy.policyId, structuredClone(policy));
  }

  async list(): Promise<PolicyAggregate[]> {
    return [...this.store.values()].map((p) => structuredClone(p));
  }

  async nextPolicyNumber(): Promise<string> {
    this.seq += 1;
    return `${this.numberPrefix}-${String(this.seq).padStart(6, "0")}`;
  }
}

export class InMemoryBillingRepository implements BillingRepository {
  private readonly store = new Map<string, BillingAccount>();

  async create(account: BillingAccount): Promise<void> {
    this.store.set(account.policyId, structuredClone(account));
  }
  async get(policyId: string): Promise<BillingAccount | undefined> {
    const found = this.store.get(policyId);
    return found ? structuredClone(found) : undefined;
  }
  async save(account: BillingAccount): Promise<void> {
    this.store.set(account.policyId, structuredClone(account));
  }
}

export class InMemoryClaimsRepository implements ClaimsRepository {
  private readonly store = new Map<string, Claim>();

  async create(claim: Claim): Promise<void> {
    this.store.set(claim.claimId, structuredClone(claim));
  }
  async get(claimId: string): Promise<Claim | undefined> {
    const found = this.store.get(claimId);
    return found ? structuredClone(found) : undefined;
  }
  async save(claim: Claim): Promise<void> {
    this.store.set(claim.claimId, structuredClone(claim));
  }
  async list(): Promise<Claim[]> {
    return [...this.store.values()].map((c) => structuredClone(c));
  }
}

export class InMemoryHandlersRepository implements HandlersRepository {
  private readonly store = new Map<string, Handler>();

  constructor(seed: Handler[] = []) {
    for (const handler of seed) this.store.set(handler.handlerId, handler);
  }

  async list(): Promise<Handler[]> {
    return [...this.store.values()].map((h) => structuredClone(h));
  }
  async get(handlerId: string): Promise<Handler | undefined> {
    const found = this.store.get(handlerId);
    return found ? structuredClone(found) : undefined;
  }
  async save(handler: Handler): Promise<void> {
    this.store.set(handler.handlerId, structuredClone(handler));
  }
}

export class InMemoryAssignmentLogRepository implements AssignmentLogRepository {
  private readonly entries: AssignmentLogEntry[] = [];

  async append(entry: AssignmentLogEntry): Promise<void> {
    this.entries.push(structuredClone(entry));
  }
  async listForClaim(claimId: string): Promise<AssignmentLogEntry[]> {
    return this.entries
      .filter((e) => e.claimId === claimId)
      .map((e) => structuredClone(e));
  }
}

export class InMemoryCustomerRepository implements CustomerRepository {
  private readonly store = new Map<string, Customer>();

  async create(customer: Customer): Promise<void> {
    this.store.set(customer.customerId, structuredClone(customer));
  }
  async get(customerId: string): Promise<Customer | undefined> {
    const found = this.store.get(customerId);
    return found ? structuredClone(found) : undefined;
  }
  async save(customer: Customer): Promise<void> {
    this.store.set(customer.customerId, structuredClone(customer));
  }
  async list(): Promise<Customer[]> {
    return [...this.store.values()].map((c) => structuredClone(c));
  }
}
