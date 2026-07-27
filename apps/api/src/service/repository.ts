import type { PolicyAggregate } from "./types.js";

/**
 * The persistence port. The service depends only on this interface, so the
 * lifecycle logic is testable with the in-memory adapter below and swappable
 * for a Postgres/Drizzle adapter (mapping to packages/db) with no code change.
 */
export interface PolicyRepository {
  create(policy: PolicyAggregate): Promise<void>;
  get(policyId: string): Promise<PolicyAggregate | undefined>;
  save(policy: PolicyAggregate): Promise<void>;
  nextPolicyNumber(): Promise<string>;
}

/** In-memory adapter — used by tests, the demo, and local dev. */
export class InMemoryPolicyRepository implements PolicyRepository {
  private readonly store = new Map<string, PolicyAggregate>();
  private seq = 0;

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

  async nextPolicyNumber(): Promise<string> {
    this.seq += 1;
    return `PC-2026-${String(this.seq).padStart(6, "0")}`;
  }
}
