import { describe, it, expect } from "vitest";
import { buildTimeline, snapshotAsOf } from "../src/index.js";
import type { Issue, Transaction } from "../src/index.js";

/**
 * The week-one proof. If these pass, the hardest part of an insurance core —
 * the effective-dated / bitemporal spine — is behind us, and everything after
 * is ordinary engineering.
 *
 * Scenario (a private-car policy for the 2026 term):
 *   - Issue:  driver A, IDV 600,000, term 2026-01-01 .. 2027-01-01
 *   - E1:     add driver B, effective 2026-04-01, recorded 2026-04-01
 *   - E2:     raise IDV to 700,000, effective 2026-02-01 — but recorded LATE,
 *             on 2026-06-01. This is a BACKDATED, out-of-sequence endorsement.
 */

interface MotorState {
  drivers: string[];
  idv: number;
}

const issue: Issue<MotorState> = {
  term: { from: "2026-01-01", to: "2027-01-01" },
  recordedAt: "2026-01-01T00:00:00Z",
  base: { drivers: ["A"], idv: 600_000 },
};

const addDriverB: Transaction<MotorState> = {
  txnType: "ENDORSE",
  effectiveFrom: "2026-04-01",
  recordedAt: "2026-04-01T10:00:00Z",
  apply: (s) => ({ ...s, drivers: [...s.drivers, "B"] }),
};

const raiseIdvBackdated: Transaction<MotorState> = {
  txnType: "ENDORSE",
  effectiveFrom: "2026-02-01",
  recordedAt: "2026-06-01T10:00:00Z", // recorded two months after it takes effect
  apply: (s) => ({ ...s, idv: 700_000 }),
};

describe("effective-dated policy timeline", () => {
  it("reconstructs the policy as-of any business date (as known now)", () => {
    const timeline = buildTimeline(issue, [addDriverB, raiseIdvBackdated]);

    // Before either endorsement
    expect(snapshotAsOf(timeline, "2026-01-15")).toEqual({
      drivers: ["A"],
      idv: 600_000,
    });

    // After the backdated IDV change, before driver B was added
    expect(snapshotAsOf(timeline, "2026-03-01")).toEqual({
      drivers: ["A"],
      idv: 700_000,
    });

    // After both — the backdated change persists FORWARD through the later slice
    expect(snapshotAsOf(timeline, "2026-05-01")).toEqual({
      drivers: ["A", "B"],
      idv: 700_000,
    });
  });

  it("keeps issued slices contiguous and non-overlapping", () => {
    const timeline = buildTimeline(issue, [addDriverB, raiseIdvBackdated]);
    expect(timeline.map((s) => s.effective)).toEqual([
      { from: "2026-01-01", to: "2026-02-01" },
      { from: "2026-02-01", to: "2026-04-01" },
      { from: "2026-04-01", to: "2027-01-01" },
    ]);
  });

  it("supports the system-time axis: 'as we knew it then' differs from 'now'", () => {
    // Reconstruct as best known on 2026-05-01 — BEFORE the backdated E2 (recorded
    // 2026-06-01) had arrived. The IDV correction must not yet be visible.
    const asKnownInMay = buildTimeline(
      issue,
      [addDriverB, raiseIdvBackdated],
      "2026-05-01T00:00:00Z",
    );

    expect(snapshotAsOf(asKnownInMay, "2026-03-01")).toEqual({
      drivers: ["A"],
      idv: 600_000, // still the original — the backdated raise wasn't known yet
    });

    // ...whereas reconstructing with full knowledge shows the correction.
    const asKnownNow = buildTimeline(issue, [addDriverB, raiseIdvBackdated]);
    expect(snapshotAsOf(asKnownNow, "2026-03-01")).toEqual({
      drivers: ["A"],
      idv: 700_000,
    });
  });
});
