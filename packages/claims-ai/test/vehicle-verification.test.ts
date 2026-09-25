import { describe, it, expect } from "vitest";
import { checkVehicleDetails, type RegistryVehicleDetails } from "../src/index.js";

const registry: RegistryVehicleDetails = {
  chassisNumber: "MA3ERLF1S00123456",
  engineNumber: "K12MN1234567",
  ownerName: "A. Sharma",
};

describe("checkVehicleDetails — deterministic registry cross-check", () => {
  it("produces no signals when every declared field matches", () => {
    const result = checkVehicleDetails(
      {
        chassisNumber: "MA3ERLF1S00123456",
        engineNumber: "K12MN1234567",
        ownerName: "A. Sharma",
      },
      registry,
    );
    expect(result.signals).toHaveLength(0);
  });

  it("is whitespace/case-insensitive when matching", () => {
    const result = checkVehicleDetails(
      {
        chassisNumber: "  ma3erlf1s00123456  ",
        ownerName: "a.   sharma",
      },
      registry,
    );
    expect(result.signals).toHaveLength(0);
  });

  it("flags a chassis number mismatch", () => {
    const result = checkVehicleDetails({ chassisNumber: "WRONG-CHASSIS" }, registry);
    expect(result.signals).toEqual([
      "VEHICLE_DETAILS_MISMATCH: declared chassis number does not match the vehicle registry",
    ]);
  });

  it("flags an engine number mismatch", () => {
    const result = checkVehicleDetails({ engineNumber: "WRONG-ENGINE" }, registry);
    expect(result.signals).toEqual([
      "VEHICLE_DETAILS_MISMATCH: declared engine number does not match the vehicle registry",
    ]);
  });

  it("flags an owner name mismatch", () => {
    const result = checkVehicleDetails({ ownerName: "Someone Else" }, registry);
    expect(result.signals).toEqual([
      "VEHICLE_DETAILS_MISMATCH: declared owner name does not match the vehicle registry",
    ]);
  });

  it("flags multiple mismatches independently", () => {
    const result = checkVehicleDetails(
      { chassisNumber: "WRONG", engineNumber: "WRONG", ownerName: "WRONG" },
      registry,
    );
    expect(result.signals).toHaveLength(3);
  });

  it("never flags a field the claimant didn't declare", () => {
    const result = checkVehicleDetails({}, registry);
    expect(result.signals).toHaveLength(0);
  });
});
