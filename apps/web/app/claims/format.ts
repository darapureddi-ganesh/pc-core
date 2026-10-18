import type { IrdaiClock } from "../types";

const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const inr = (n: number): string => inrFmt.format(n);

/** "₹1.48 L" / "₹2.10 Cr" — the way Indian claims teams read totals. */
export const inrShort = (n: number): string =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(2)} L` : inr(n);

export const when = (iso: string): string =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const STEP_LABEL: Record<IrdaiClock["step"], string> = {
  APPOINT_SURVEYOR: "Appoint surveyor",
  SURVEY_REPORT: "Survey report",
  SETTLEMENT: "Settle claim",
};

/** "6 h left" / "2 d overdue" */
export function timeLeft(dueAt: string, now = Date.now()): string {
  const ms = Date.parse(dueAt) - now;
  const abs = Math.abs(ms);
  const span = abs >= 864e5 ? `${Math.round(abs / 864e5)} d` : `${Math.max(1, Math.round(abs / 36e5))} h`;
  return ms < 0 ? `${span} overdue` : `${span} left`;
}
