/**
 * Fraud scoring — v1.
 *
 * A small, deterministic set of textbook fraud indicators (repeat claiming on
 * one policy, claims filed unusually soon after inception), not a trained ML
 * model — PC Core ships no hosted ML. It exists to prove the fraud-analytics
 * pillar runs against ANY connected tenant's claim history through the same
 * ClaimsRepository port, and to define the interface a company can swap a
 * real graph/anomaly model behind later without touching ClaimsService.
 */

export interface FraudInput {
  /** other claims already on file for the same policy, before this one */
  priorClaimsOnPolicy: number;
  /** incidentDate − policy inception date, in whole days (negative = before inception) */
  daysSincePolicyStart: number;
}

export interface FraudResult {
  score: number; // 0..1
  signals: string[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

export function scoreFraudRisk(input: FraudInput): FraudResult {
  let score = 0;
  const signals: string[] = [];

  if (input.priorClaimsOnPolicy >= 1) {
    const weight = 0.25 * Math.min(input.priorClaimsOnPolicy, 3);
    score += weight;
    signals.push(
      `${input.priorClaimsOnPolicy} prior claim(s) already filed on this policy`,
    );
  }

  if (input.daysSincePolicyStart < 0) {
    score += 0.4;
    signals.push("incident date precedes policy inception");
  } else if (input.daysSincePolicyStart <= 15) {
    score += 0.3;
    signals.push("incident within 15 days of policy inception");
  }

  return { score: clamp01(score), signals };
}
