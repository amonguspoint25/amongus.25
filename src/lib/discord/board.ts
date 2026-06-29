import { prisma } from "@/lib/db";
import { getLeaderboard } from "./data";
import { leaderboardEmbed } from "./embeds";
import type { LeaderboardSort } from "@/lib/leaderboard";

const DISCORD_API = "https://discord.com/api/v10";
const BOARD_ID = "singleton"; // one live board

// Bot-authenticated Discord call (posting/editing channel messages needs the bot token, unlike
// interaction followups). Bounded so a slow Discord call can't hang the caller; returns null when
// no token is configured.
async function botFetch(path: string, init: RequestInit): Promise<Response | null> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  return fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(2500),
  });
}

async function buildEmbed(sort: LeaderboardSort) {
  const { ranked, provisional } = await getLeaderboard(sort);
  return leaderboardEmbed(sort, ranked, provisional);
}

// Post a fresh leaderboard message in `channelId` and remember it as THE live board. Returns false
// if the bot can't post (no token / no permission / bad channel).
export async function setupBoard(channelId: string, sort: LeaderboardSort): Promise<boolean> {
  const res = await botFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [await buildEmbed(sort)] }),
  }).catch(() => null);
  if (!res || !res.ok) return false;

  const msg = (await res.json()) as { id: string };
  await prisma.discordLeaderboard.upsert({
    where: { id: BOARD_ID },
    create: { id: BOARD_ID, channelId, messageId: msg.id, sort },
    update: { channelId, messageId: msg.id, sort },
  });
  return true;
}

// Re-edit the live board message with current standings. Best-effort: no board configured, no
// token, deleted message, or a slow Discord call all just no-op. Safe to call from ingest/void.
export async function refreshBoard(): Promise<void> {
  try {
    const board = await prisma.discordLeaderboard.findUnique({ where: { id: BOARD_ID } });
    if (!board) return;
    await botFetch(`/channels/${board.channelId}/messages/${board.messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ embeds: [await buildEmbed(board.sort as LeaderboardSort)] }),
    }).catch(() => null);
  } catch {
    // best-effort — never throw into ingest/void
  }
}
