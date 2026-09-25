/**
 * NCB (No-Claim Bonus) progression at renewal. The ladder is read from the
 * product's own `ncbScale` table (e.g. 0/20/25/35/45/50) rather than
 * hardcoded, so a different product's scale still works correctly. Any
 * claim during the expiring term drops NCB back to the bottom tier; a
 * claim-free term steps up exactly one tier, staying at the top tier once
 * reached. An `currentNcb` that isn't one of the product's tiers is left
 * unchanged rather than guessed at.
 */
export function nextNcbTier(
  currentNcb: number,
  ncbScale: Record<string, number>,
  hadClaimInTerm: boolean,
): number {
  const tiers = Object.keys(ncbScale)
    .map(Number)
    .sort((a, b) => a - b);

  if (hadClaimInTerm) {
    // the product's own bottom tier, not a hardcoded 0 — a product whose
    // scale doesn't start at 0 would otherwise reset to an unpriced NCB
    return tiers[0] ?? 0;
  }

  const index = tiers.indexOf(currentNcb);
  if (index === -1 || index === tiers.length - 1) {
    return currentNcb;
  }
  return tiers[index + 1]!;
}
