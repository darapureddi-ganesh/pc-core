import { randomUUID } from "node:crypto";
import type {
  Claim,
  ClaimsRepository,
  Customer,
  CustomerRepository,
  PolicyAggregate,
} from "@pc-core/ports";
import { ServiceError } from "./errors.js";
import type { PolicyService } from "./policy-service.js";

export interface CustomerHistory {
  customer: Customer;
  policies: PolicyAggregate[];
  claims: Claim[];
}

/**
 * The customer identity: the one thing missing from the system of record
 * that ties a person's history together across renewals, multiple vehicles,
 * and every claim on every one of their policies. A policy's own `insured`
 * field stays a plain descriptive name (used on documents); `customerId` is
 * what actually links it to this entity.
 *
 * Read-heavy by design — `history()` fans out across PolicyService and the
 * claims store to answer "everything about this person," which is exactly
 * the shape a future customer-facing portal would need.
 */
export class CustomerService {
  constructor(
    private readonly repo: CustomerRepository,
    private readonly policies: PolicyService,
    private readonly claims: ClaimsRepository,
  ) {}

  async register(cmd: {
    name: string;
    email?: string;
    phone?: string;
  }): Promise<Customer> {
    const customer: Customer = {
      customerId: randomUUID(),
      name: cmd.name,
      email: cmd.email,
      phone: cmd.phone,
      createdAt: new Date().toISOString(),
    };
    await this.repo.create(customer);
    return customer;
  }

  async get(customerId: string): Promise<Customer> {
    return this.load(customerId);
  }

  async list(): Promise<Customer[]> {
    return this.repo.list();
  }

  async history(customerId: string): Promise<CustomerHistory> {
    const customer = await this.load(customerId);

    const allPolicies = await this.policies.list();
    const policies = allPolicies.filter((p) => p.customerId === customerId);
    const policyIds = new Set(policies.map((p) => p.policyId));

    const allClaims = await this.claims.list();
    const claims = allClaims.filter((c) => policyIds.has(c.policyId));

    return { customer, policies, claims };
  }

  private async load(customerId: string): Promise<Customer> {
    const customer = await this.repo.get(customerId);
    if (!customer) {
      throw new ServiceError(`customer ${customerId} not found`, "NOT_FOUND");
    }
    return customer;
  }
}
