// Number of games (per role) a player must complete before they appear on the
// ranked leaderboard for that role. During this window their rating uses a larger
// K-factor so it converges quickly toward their true skill ("placements").
export const PLACEMENT_GAMES = 10;
export const K_PLACEMENT = 64;
export const K_NORMAL = 32;

export function kForGames(roleGames: number): number {
  return roleGames < PLACEMENT_GAMES ? K_PLACEMENT : K_NORMAL;
}

export function isProvisional(roleGames: number): boolean {
  return roleGames < PLACEMENT_GAMES;
}
