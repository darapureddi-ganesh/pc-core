export {
  InMemoryPolicyRepository,
  InMemoryBillingRepository,
  InMemoryClaimsRepository,
  InMemoryHandlersRepository,
  InMemoryAssignmentLogRepository,
  InMemoryCustomerRepository,
} from "./in-memory.js";

export { RemoteHttpPolicyRepository } from "./remote-http-policy.js";

export { MockVehicleRegistry } from "./mock-vehicle-registry.js";
export { MockDigiLocker } from "./mock-digilocker.js";

export {
  PostgresPolicyRepository,
  PostgresBillingRepository,
  PostgresClaimsRepository,
  PostgresHandlersRepository,
  PostgresAssignmentLogRepository,
  PostgresCustomerRepository,
} from "./postgres.js";
