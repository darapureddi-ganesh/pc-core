import type { Priority } from "./types.js";

/** Turnaround-time allowance in days, by priority. IRDAI's default TAT mandate is 30 days. */
export type SlaWindows = Record<Priority, number>;

export const DEFAULT_SLA_WINDOWS: SlaWindows = {
  CRITICAL: 7,
  HIGH: 15,
  MEDIUM: 30,
  LOW: 30,
};

export interface SlaResult {
  slaDeadline: string; // ISO date
  slaRiskScore: number; // 0..1, elapsed / allowance, clamped
  slaBreached: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * SLA risk against a claim's incident date. `asOf` defaults to now — pass a
 * fixed date to keep this pure and testable at the call site.
 */
export function computeSla(
  incidentDate: string,
  priority: Priority,
  asOf: Date = new Date(),
  windows: SlaWindows = DEFAULT_SLA_WINDOWS,
): SlaResult {
  const tatDays = windows[priority];
  const incident = Date.parse(`${incidentDate}T00:00:00Z`);
  if (Number.isNaN(incident)) {
    throw new Error(`computeSla: invalid incidentDate "${incidentDate}"`);
  }
  const deadline = new Date(incident + tatDays * MS_PER_DAY);
  const elapsedDays = (asOf.getTime() - incident) / MS_PER_DAY;

  return {
    slaDeadline: deadline.toISOString().slice(0, 10),
    slaRiskScore: Math.max(0, Math.min(1, elapsedDays / tatDays)),
    slaBreached: elapsedDays > tatDays,
  };
}
