import { describe, it, expect, beforeEach } from "vitest";
import {
  InMemoryClaimsRepository,
  InMemoryCustomerRepository,
  InMemoryPolicyRepository,
} from "@pc-core/adapters";
import type { MotorRisk } from "@pc-core/ports";
import { PolicyService, type QuoteCommand } from "../src/service/policy-service.js";
import { ClaimsService } from "../src/service/claims-service.js";
import { CustomerService } from "../src/service/customer-service.js";

const risk: MotorRisk = {
  vehicle: { cc: 1200, idv: 600_000, rtoZone: "A", age: 2 },
  policy: { ncb: 25 },
  selectedAddOns: [],
  coverages: { tpSelected: true },
};

let policies: PolicyService;
let claims: ClaimsService;
let customers: CustomerService;

beforeEach(() => {
  policies = new PolicyService(new InMemoryPolicyRepository());
  const claimsRepo = new InMemoryClaimsRepository();
  claims = new ClaimsService(claimsRepo, policies);
  customers = new CustomerService(new InMemoryCustomerRepository(), policies, claimsRepo);
});

describe("CustomerService — the identity tying a person's history together", () => {
  it("registers a customer and can look them back up", async () => {
    const registered = await customers.register({
      name: "A. Sharma",
      email: "a.sharma@example.com",
    });
    expect(registered.customerId).toBeTruthy();

    const fetched = await customers.get(registered.customerId);
    expect(fetched.name).toBe("A. Sharma");
    expect(fetched.email).toBe("a.sharma@example.com");
  });

  it("throws NOT_FOUND for an unknown customer", async () => {
    await expect(customers.get("missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lists every registered customer", async () => {
    await customers.register({ name: "First" });
    await customers.register({ name: "Second" });
    const all = await customers.list();
    expect(all.map((c) => c.name).sort()).toEqual(["First", "Second"]);
  });

  it("aggregates a customer's policies and claims across renewals and vehicles", async () => {
    const customer = await customers.register({ name: "A. Sharma" });

    const quoteCmd = (term: { from: string; to: string }): QuoteCommand => ({
      productCode: "PRIVATE_CAR",
      term,
      risk,
      customerId: customer.customerId,
    });

    // First vehicle, this year
    const { policyId: policy1 } = await policies.quote(
      quoteCmd({ from: "2026-01-01", to: "2027-01-01" }),
    );
    await policies.bind(policy1);
    await policies.issue(policy1);
    const claim1 = await claims.fnol({
      policyId: policy1,
      incidentDate: "2026-03-01",
      cause: "collision",
    });

    // A second vehicle, same customer
    const { policyId: policy2 } = await policies.quote(
      quoteCmd({ from: "2026-01-01", to: "2027-01-01" }),
    );
    await policies.bind(policy2);
    await policies.issue(policy2);

    // A totally unrelated customer's policy — must not leak into the history
    const other = await customers.register({ name: "Someone Else" });
    const { policyId: otherPolicy } = await policies.quote({
      productCode: "PRIVATE_CAR",
      term: { from: "2026-01-01", to: "2027-01-01" },
      risk,
      customerId: other.customerId,
    });
    await policies.bind(otherPolicy);
    await policies.issue(otherPolicy);

    const history = await customers.history(customer.customerId);
    expect(history.customer.name).toBe("A. Sharma");
    expect(history.policies.map((p) => p.policyId).sort()).toEqual(
      [policy1, policy2].sort(),
    );
    expect(history.claims.map((c) => c.claimId)).toEqual([claim1.claimId]);
  });
});
