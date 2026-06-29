// Number of games (per role) a player must complete before they appear on the
// ranked leaderboard for that role. During this window their rating uses a larger
// K-factor so it converges quickly toward their true skill ("placements").
export const PLACEMENT_GAMES = 10;
export const K_PLACEMENT = 40;
export const K_NORMAL = 24;

// Hard rank cap during placement: while provisional, a player's rating can't exceed the top
// of Gold, so no matter how well they do they exit placements at most Gold and earn Platinum+
// with real games afterward. MUST stay inside the Gold band — one below Platinum's threshold
// in rank.ts (guarded by a test). Update both together if the tiers change.
export const PLACEMENT_RANK_CEILING = 1279;

export function kForGames(roleGames: number): number {
  return roleGames < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
}

export function isProvisional(roleGames: number): boolean {
  return roleGames < PLACEMENT_GAMES;
}

// Clamp a freshly-computed rating to the Gold ceiling while the player is still in placement.
// No-op once they've graduated (roleGames >= PLACEMENT_GAMES).
export function applyPlacementCap(elo: number, roleGames: number): number {
  return isProvisional(roleGames) ? Math.min(elo, PLACEMENT_RANK_CEILING) : elo;
}
