import type { ClaimType, Handler } from "./types.js";

export interface HandlerScore {
  handlerId: string;
  name: string;
  score: number; // 0..1, weighted composite
  expertiseMatch: number; // 1 if rated for this claim type, else 0.3 (can still take it)
  workloadFactor: number; // 0..1, headroom left under maxCapacity
  speedFactor: number; // 0..1, faster average handling + more experience scores higher
  availability: boolean;
}

const WEIGHTS = { expertise: 0.4, workload: 0.3, availability: 0.15, speed: 0.15 };

function speedFactor(handler: Handler): number {
  // Normalize against a generous ceiling rather than the candidate pool, so a
  // single slow/inexperienced handler in the list can't inflate everyone else's score.
  const daysFactor = Math.max(0, Math.min(1, 1 - handler.avgHandlingDays / 30));
  const experienceFactor = Math.max(0, Math.min(1, handler.experienceYears / 10));
  return 0.6 * daysFactor + 0.4 * experienceFactor;
}

/** Weighted handler score for one claim type — pure and stateless. */
export function scoreHandler(claimType: ClaimType, handler: Handler): HandlerScore {
  const expertiseMatch = handler.expertise.includes(claimType) ? 1 : 0.3;
  const workloadFactor = Math.max(
    0,
    1 - handler.currentWorkload / Math.max(1, handler.maxCapacity),
  );
  const speed = speedFactor(handler);
  const availability = handler.isAvailable;

  const score =
    WEIGHTS.expertise * expertiseMatch +
    WEIGHTS.workload * workloadFactor +
    WEIGHTS.speed * speed +
    (availability ? WEIGHTS.availability : 0);

  return {
    handlerId: handler.handlerId,
    name: handler.name,
    score,
    expertiseMatch,
    workloadFactor,
    speedFactor: speed,
    availability,
  };
}

/**
 * Ranks every handler for a claim type, highest score first. Unavailable handlers
 * are scored (so the caller can see why) but pushed to the bottom — they never
 * outrank an available one.
 */
export function rankHandlers(claimType: ClaimType, handlers: Handler[]): HandlerScore[] {
  return handlers
    .map((h) => scoreHandler(claimType, h))
    .sort((a, b) => {
      if (a.availability !== b.availability) return a.availability ? -1 : 1;
      return b.score - a.score;
    });
}
