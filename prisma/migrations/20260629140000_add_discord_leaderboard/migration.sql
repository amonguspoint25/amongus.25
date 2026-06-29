-- The single live-updating Discord leaderboard message (channel + message the bot edits).
CREATE TABLE "DiscordLeaderboard" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sort" TEXT NOT NULL DEFAULT 'overall',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DiscordLeaderboard_pkey" PRIMARY KEY ("id")
);
