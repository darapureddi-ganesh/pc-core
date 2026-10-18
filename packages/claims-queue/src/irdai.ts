import type { ClaimStage } from "./types.js";

/**
 * IRDAI's general-insurance claim clocks (2024 rules): surveyor allotted within
 * 24 hours of intimation, survey report within 15 days of appointment, and
 * settlement within 7 days of the report. Config, not code — pass different
 * windows if the regulator changes them.
 */
export interface IrdaiWindows {
  surveyorHours: number;
  surveyReportDays: number;
  settlementDays: number;
}

export const DEFAULT_IRDAI_WINDOWS: IrdaiWindows = {
  surveyorHours: 24,
  surveyReportDays: 15,
  settlementDays: 7,
};

export interface IrdaiClock {
  /** the next regulated step this claim is waiting on */
  step: "APPOINT_SURVEYOR" | "SURVEY_REPORT" | "SETTLEMENT";
  /** human-readable rule, for the queue and the audit trail */
  rule: string;
  dueAt: string; // ISO date-time
  overdue: boolean;
}

export interface IrdaiClockInput {
  stage?: ClaimStage;
  reportedAt?: string;
  surveyor?: { appointedAt: string; reportAt?: string };
}

const HOUR = 60 * 60 * 1000;

/**
 * Which IRDAI deadline a claim is running against right now, or null when none
 * applies (settled, or a claim filed before stages were tracked). Pure —
 * pass `asOf` to test.
 */
export function irdaiClock(
  claim: IrdaiClockInput,
  asOf: Date = new Date(),
  windows: IrdaiWindows = DEFAULT_IRDAI_WINDOWS,
): IrdaiClock | null {
  const clock = (step: IrdaiClock["step"], rule: string, from: string, hours: number): IrdaiClock => {
    const due = Date.parse(from) + hours * HOUR;
    return { step, rule, dueAt: new Date(due).toISOString(), overdue: asOf.getTime() > due };
  };

  if (claim.stage === "INTIMATED" && claim.reportedAt) {
    return clock("APPOINT_SURVEYOR", `Surveyor within ${windows.surveyorHours} h of intimation`, claim.reportedAt, windows.surveyorHours);
  }
  if (claim.stage === "SURVEY" && claim.surveyor) {
    return clock("SURVEY_REPORT", `Survey report within ${windows.surveyReportDays} days`, claim.surveyor.appointedAt, windows.surveyReportDays * 24);
  }
  if (claim.stage === "ASSESSMENT" && claim.surveyor?.reportAt) {
    return clock("SETTLEMENT", `Settle within ${windows.settlementDays} days of the report`, claim.surveyor.reportAt, windows.settlementDays * 24);
  }
  return null;
}
