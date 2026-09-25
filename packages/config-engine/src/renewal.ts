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
  if (hadClaimInTerm) return 0;

  const tiers = Object.keys(ncbScale)
    .map(Number)
    .sort((a, b) => a - b);
  const index = tiers.indexOf(currentNcb);
  if (index === -1 || index === tiers.length - 1) {
    return currentNcb;
  }
  return tiers[index + 1]!;
}
