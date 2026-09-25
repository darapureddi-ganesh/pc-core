import { describe, it, expect } from "vitest";
import { addOneYear } from "../src/index.js";

describe("addOneYear", () => {
  it("adds a calendar year to an ordinary date", () => {
    expect(addOneYear("2026-01-01")).toBe("2027-01-01");
  });

  it("preserves the month and day across a leap-year boundary that doesn't involve Feb 29", () => {
    expect(addOneYear("2024-03-15")).toBe("2025-03-15");
  });

  it("rolls a Feb-29 anniversary to Mar 1 — the next year is never also a leap year", () => {
    expect(addOneYear("2024-02-29")).toBe("2025-03-01");
    expect(addOneYear("2000-02-29")).toBe("2001-03-01");
  });
});
