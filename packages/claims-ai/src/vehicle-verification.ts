/**
 * Vehicle-details cross-check against an external vehicle registry (e.g.
 * VAHAN) — deterministic, explainable, no LLM call. Same "textbook fraud
 * indicator" stance as fraud.ts: this pure function takes plain data in and
 * out, so it has no dependency on how a company's VehicleRegistryPort
 * adapter (see @pc-core/ports, @pc-core/adapters) actually fetches a
 * record — ClaimsService is what wires the two together.
 */

export interface DeclaredVehicleDetails {
  chassisNumber?: string;
  engineNumber?: string;
  ownerName?: string;
}

export interface RegistryVehicleDetails {
  chassisNumber: string;
  engineNumber: string;
  ownerName: string;
}

export interface VehicleVerificationResult {
  signals: string[];
}

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Compares FNOL-declared vehicle identity fields against an authoritative
 * registry record. Only fields the claimant actually declared are compared —
 * an omitted field is never itself treated as a mismatch.
 */
export function checkVehicleDetails(
  declared: DeclaredVehicleDetails,
  registry: RegistryVehicleDetails,
): VehicleVerificationResult {
  const signals: string[] = [];

  if (
    declared.chassisNumber &&
    normalize(declared.chassisNumber) !== normalize(registry.chassisNumber)
  ) {
    signals.push(
      "VEHICLE_DETAILS_MISMATCH: declared chassis number does not match the vehicle registry",
    );
  }
  if (
    declared.engineNumber &&
    normalize(declared.engineNumber) !== normalize(registry.engineNumber)
  ) {
    signals.push(
      "VEHICLE_DETAILS_MISMATCH: declared engine number does not match the vehicle registry",
    );
  }
  if (declared.ownerName && normalize(declared.ownerName) !== normalize(registry.ownerName)) {
    signals.push(
      "VEHICLE_DETAILS_MISMATCH: declared owner name does not match the vehicle registry",
    );
  }

  return { signals };
}
