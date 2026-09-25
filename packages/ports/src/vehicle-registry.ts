/** A vehicle's authoritative registration record, as held by the national
 * vehicle registry (VAHAN, run by NIC/MoRTH). */
export interface VehicleRecord {
  regNo: string;
  ownerName: string;
  chassisNumber: string;
  engineNumber: string;
  registrationDate: string;
  vehicleClass: string;
  fitnessValidUntil: string;
  puccValidUntil: string;
  rtoCode: string;
}

/**
 * The vehicle-registry lookup contract — part of the Connector SDK, same
 * "swappable provider, no hosted service shipped" shape as claims-ai's
 * FraudScorer/DocumentExtractor. VAHAN itself is NOT a public API: real
 * access requires NIC/MoRTH onboarding as an authorized requesting entity
 * (an insurer or their approved intermediary), not something this repo can
 * ship a working default for. See @pc-core/adapters's MockVehicleRegistry
 * for a synthetic reference adapter, and swap in an authorized one per
 * tenant for production use.
 */
export interface VehicleRegistryPort {
  lookupByRegistrationNumber(regNo: string): Promise<VehicleRecord | null>;
}
