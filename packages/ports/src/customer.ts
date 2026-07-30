/**
 * A customer/policyholder identity — the thing that persists across renewals,
 * multiple vehicles, and every claim on every one of their policies. Nothing
 * else in the system currently links a person's history together: a policy's
 * `insured` is just a descriptive name string used on documents, not an
 * identity you can look up. This is the "system of record" customer entity.
 */
export interface Customer {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

/** The customer storage contract — part of the Connector SDK, same shape as
 * every other repository port (create/get/save/list). */
export interface CustomerRepository {
  create(customer: Customer): Promise<void>;
  get(customerId: string): Promise<Customer | undefined>;
  save(customer: Customer): Promise<void>;
  list(): Promise<Customer[]>;
}
