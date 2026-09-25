import type { VehicleRecord, VehicleRegistryPort } from "@pc-core/ports";

/**
 * MOCK ONLY — real VAHAN access requires NIC/MoRTH onboarding, not a public
 * API. This returns synthetic data for a small fixed set of registration
 * numbers, so the claims-side fraud check (see apps/api's ClaimsService) has
 * something to run against in the demo. Replace with an authorized adapter
 * for production use.
 */
export class MockVehicleRegistry implements VehicleRegistryPort {
  private readonly records: Record<string, VehicleRecord> = {
    KA01AB1234: {
      regNo: "KA01AB1234",
      ownerName: "A. Sharma",
      chassisNumber: "MA3ERLF1S00123456",
      engineNumber: "K12MN1234567",
      registrationDate: "2024-01-01",
      vehicleClass: "LMV",
      fitnessValidUntil: "2039-01-01",
      puccValidUntil: "2026-12-31",
      rtoCode: "KA01",
    },
    MH12CD5678: {
      regNo: "MH12CD5678",
      ownerName: "R. Patel",
      chassisNumber: "MA3FHEB1S00654321",
      engineNumber: "D13AN7654321",
      registrationDate: "2022-06-15",
      vehicleClass: "LMV",
      fitnessValidUntil: "2037-06-15",
      puccValidUntil: "2026-06-15",
      rtoCode: "MH12",
    },
    DL08EF9012: {
      regNo: "DL08EF9012",
      ownerName: "S. Verma",
      chassisNumber: "MA3NWF11S00998877",
      engineNumber: "G12BT9988776",
      registrationDate: "2023-03-10",
      vehicleClass: "LMV",
      fitnessValidUntil: "2038-03-10",
      puccValidUntil: "2026-09-10",
      rtoCode: "DL08",
    },
  };

  async lookupByRegistrationNumber(regNo: string): Promise<VehicleRecord | null> {
    const key = regNo.toUpperCase().replace(/\s+/g, "");
    return this.records[key] ?? null;
  }
}
