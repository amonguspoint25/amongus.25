// Soft reset between seasons: skill carries, the ladder reopens. A returning player's
// rating is pulled partway back toward the 1000 baseline; a new player starts at 1000.
export const SOFT_RESET_FACTOR = 0.5;

export function softResetSeed(
  prevElo: number | null | undefined,
  factor: number = SOFT_RESET_FACTOR,
): number {
  if (prevElo == null) return 1000;
  return 1000 + (prevElo - 1000) * factor;
}
