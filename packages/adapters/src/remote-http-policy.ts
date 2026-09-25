import type { PolicyAggregate, PolicyRepository } from "@pc-core/ports";

/**
 * Adapts a PolicyRepository onto a remote HTTP service — the reference
 * implementation of PC Core's REST connector contract. Any company can
 * satisfy this contract in whatever language or database they already run,
 * front it with a thin HTTP service, and point this adapter at it. PC Core's
 * PolicyService is unaware the data lives outside this process.
 *
 * Contract (relative to `baseUrl`):
 *   POST   /policies              body: PolicyAggregate        -> 201
 *   GET    /policies/:policyId    -> 200 PolicyAggregate | 404
 *   PUT    /policies/:policyId    body: PolicyAggregate        -> 200
 *   GET    /policies              -> 200 PolicyAggregate[]
 *   POST   /policies/next-number  -> 200 { policyNumber: string }
 *
 * See apps/mock-insurer for a working reference implementation of this
 * contract against a deliberately different internal data shape.
 */
export class RemoteHttpPolicyRepository implements PolicyRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async create(policy: PolicyAggregate): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(policy),
    });
    this.assertOk(res, "create policy");
  }

  async get(policyId: string): Promise<PolicyAggregate | undefined> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies/${policyId}`);
    if (res.status === 404) return undefined;
    this.assertOk(res, "get policy");
    return (await res.json()) as PolicyAggregate;
  }

  async save(policy: PolicyAggregate): Promise<void> {
    const res = await this.fetchImpl(
      `${this.baseUrl}/policies/${policy.policyId}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policy),
      },
    );
    this.assertOk(res, "save policy");
  }

  async list(): Promise<PolicyAggregate[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies`);
    this.assertOk(res, "list policies");
    return (await res.json()) as PolicyAggregate[];
  }

  async nextPolicyNumber(): Promise<string> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies/next-number`, {
      method: "POST",
    });
    this.assertOk(res, "reserve next policy number");
    const body = (await res.json()) as { policyNumber: string };
    return body.policyNumber;
  }

  private assertOk(res: Response, action: string): void {
    if (!res.ok) {
      throw new Error(
        `remote connector failed to ${action}: ${res.status} ${res.statusText}`,
      );
    }
  }
}
