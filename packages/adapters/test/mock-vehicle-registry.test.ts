import { describe, it, expect } from "vitest";
import { MockVehicleRegistry } from "../src/mock-vehicle-registry.js";

describe("MockVehicleRegistry — synthetic VAHAN stand-in", () => {
  it("returns a record for a known registration number", async () => {
    const registry = new MockVehicleRegistry();
    const record = await registry.lookupByRegistrationNumber("KA01AB1234");
    expect(record).not.toBeNull();
    expect(record?.ownerName).toBe("A. Sharma");
    expect(record?.chassisNumber).toBe("MA3ERLF1S00123456");
  });

  it("is tolerant of case and whitespace in the plate number", async () => {
    const registry = new MockVehicleRegistry();
    const record = await registry.lookupByRegistrationNumber("ka01 ab1234");
    expect(record?.regNo).toBe("KA01AB1234");
  });

  it("returns null for an unknown registration number", async () => {
    const registry = new MockVehicleRegistry();
    const record = await registry.lookupByRegistrationNumber("XX99ZZ0000");
    expect(record).toBeNull();
  });
});
