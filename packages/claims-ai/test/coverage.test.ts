import { describe, it, expect } from "vitest";
import { checkCoverage, type CoverageInput } from "../src/coverage.js";

const base: CoverageInput = {
  cause: "collision",
  incidentDate: "2026-03-01",
  term: { from: "2026-01-01", to: "2027-01-01" },
  addOns: [],
};
const state = (input: CoverageInput, title: string) =>
  checkCoverage(input).find((c) => c.title.startsWith(title))?.state;

describe("checkCoverage", () => {
  it("fails an incident after a cancellation took effect", () => {
    expect(state(base, "Policy in force")).toBe("PASS");
    expect(state({ ...base, cancelledEffectiveFrom: "2026-02-01" }, "Policy in force")).toBe("FAIL");
  });

  it("reports the VAHAN result, or says it was not checked", () => {
    expect(state({ ...base, vehicleCheck: "MATCHED" }, "Vehicle")).toBe("PASS");
    expect(state({ ...base, vehicleCheck: "MISMATCH" }, "Vehicle")).toBe("FAIL");
    expect(state(base, "Vehicle")).toBe("CHECK");
  });

  it("needs Engine Protect for flood engine damage", () => {
    const flood = { ...base, cause: "flood water entered engine" };
    expect(state(flood, "Engine damage")).toBe("CHECK");
    expect(state({ ...flood, addOns: ["ENGINE_PROT"] }, "Engine damage")).toBe("PASS");
    expect(state(base, "Engine damage")).toBeUndefined();
  });

  it("asks for police reports on theft", () => {
    expect(state({ ...base, cause: "car stolen from parking" }, "Police FIR")).toBe("CHECK");
  });
});
