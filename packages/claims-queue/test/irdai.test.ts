import { describe, it, expect } from "vitest";
import { irdaiClock } from "../src/irdai.js";

const at = (iso: string) => new Date(iso);

describe("irdaiClock", () => {
  it("runs the 24 h surveyor clock from intimation", () => {
    const claim = { stage: "INTIMATED" as const, reportedAt: "2026-03-01T10:00:00Z" };
    expect(irdaiClock(claim, at("2026-03-02T09:00:00Z"))).toMatchObject({
      step: "APPOINT_SURVEYOR",
      dueAt: "2026-03-02T10:00:00.000Z",
      overdue: false,
    });
    expect(irdaiClock(claim, at("2026-03-02T11:00:00Z"))?.overdue).toBe(true);
  });

  it("runs 15 days for the report, then 7 days to settle", () => {
    const surveyor = { appointedAt: "2026-03-01T00:00:00Z" };
    expect(irdaiClock({ stage: "SURVEY", surveyor })?.dueAt).toBe("2026-03-16T00:00:00.000Z");
    expect(
      irdaiClock({ stage: "ASSESSMENT", surveyor: { ...surveyor, reportAt: "2026-03-10T00:00:00Z" } })?.dueAt,
    ).toBe("2026-03-17T00:00:00.000Z");
  });

  it("has no clock once settled, or for claims filed before stages were tracked", () => {
    expect(irdaiClock({ stage: "SETTLED" })).toBeNull();
    expect(irdaiClock({})).toBeNull();
  });
});
