import type { Prisma } from "@prisma/client";
import { PLACEMENT_GAMES } from "./elo/placement";

/**
 * Restricts a Player query to real Discord-created accounts, excluding the
 * seed/demo players (whose linked user's discordId starts with "demo-").
 * Used by the leaderboard and the home rankings so only genuine sign-ins rank.
 */
export const realPlayersWhere: Prisma.PlayerWhereInput = {
  NOT: { user: { discordId: { startsWith: "demo-" } } },
};

/**
 * Restricts to real players who have completed enough total games to be "ranked"
 * overall (used by the home #rankings preview). Provisional players are excluded.
 */
export const rankedOverallWhere: Prisma.PlayerWhereInput = {
  ...realPlayersWhere,
  games: { gte: PLACEMENT_GAMES },
};
