import type { PolicyAggregate, PolicyRepository } from "@pc-core/ports";
import {
  applyPolicyEnvelopeMapping,
  unapplyPolicyEnvelopeMapping,
  type PolicyEnvelopeMapping,
} from "@pc-core/schema-mapping";

/**
 * Same REST contract and endpoints as RemoteHttpPolicyRepository — the
 * difference is the request/response bodies are in the company's OWN
 * record shape, not PolicyAggregate. A confirmed PolicyEnvelopeMapping
 * (see @pc-core/schema-mapping, and POST /connectors/propose-mapping)
 * translates both directions, so a company only needs a thin REST facade
 * over their existing database at these paths — they never write the
 * translation code apps/mock-insurer's toContract/toBeta hand-writes today.
 *
 * The mapping was reviewed and confirmed by a person before it reached
 * here (see @pc-core/schema-mapping's dryRunMapping) — this adapter itself
 * still fails loudly rather than silently on any record that doesn't fit
 * it, via applyPolicyEnvelopeMapping's descriptive errors.
 */
export class MappedRemoteHttpPolicyRepository implements PolicyRepository {
  constructor(
    private readonly baseUrl: string,
    private readonly mapping: PolicyEnvelopeMapping,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async create(policy: PolicyAggregate): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(unapplyPolicyEnvelopeMapping(policy, this.mapping)),
    });
    this.assertOk(res, "create policy");
  }

  async get(policyId: string): Promise<PolicyAggregate | undefined> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies/${policyId}`);
    if (res.status === 404) return undefined;
    this.assertOk(res, "get policy");
    return applyPolicyEnvelopeMapping(await res.json(), this.mapping);
  }

  async save(policy: PolicyAggregate): Promise<void> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies/${policy.policyId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(unapplyPolicyEnvelopeMapping(policy, this.mapping)),
    });
    this.assertOk(res, "save policy");
  }

  async list(): Promise<PolicyAggregate[]> {
    const res = await this.fetchImpl(`${this.baseUrl}/policies`);
    this.assertOk(res, "list policies");
    const raw = (await res.json()) as unknown[];
    return raw.map((r) => applyPolicyEnvelopeMapping(r, this.mapping));
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
        `mapped connector failed to ${action}: ${res.status} ${res.statusText}`,
      );
    }
  }
}
