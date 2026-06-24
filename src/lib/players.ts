import type { Prisma } from "@prisma/client";

/**
 * Restricts a Player query to real Discord-created accounts, excluding the
 * seed/demo players (whose linked user's discordId starts with "demo-").
 * Used by the leaderboard and the home rankings so only genuine sign-ins rank.
 */
export const realPlayersWhere: Prisma.PlayerWhereInput = {
  NOT: { user: { discordId: { startsWith: "demo-" } } },
};
