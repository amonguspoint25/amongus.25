import { NextRequest, NextResponse, after } from "next/server";
import { verifyDiscordSignature } from "@/lib/discord/verify";
import { getLeaderboard, getPlayerByDiscordId, getLastMatchFor } from "@/lib/discord/data";
import { setupBoard } from "@/lib/discord/board";
import { leaderboardEmbed, rankEmbed, lastMatchEmbed, tiersEmbed } from "@/lib/discord/embeds";
import type { LeaderboardSort } from "@/lib/leaderboard";

export const runtime = "nodejs"; // crypto + Prisma
export const dynamic = "force-dynamic";

const DISCORD_API = "https://discord.com/api/v10";

type Followup = { embeds: object[] } | { content: string };
type Opt = { name: string; value: string };

// Builds the message to deliver for a DB-backed command (runs after the ack).
async function buildResponse(name: string, options: Opt[], callerId: string | undefined, channelId: string): Promise<Followup> {
  const opt = (n: string) => options.find((o) => o.name === n)?.value;

  if (name === "setup-leaderboard") {
    const tab = (opt("tab") as LeaderboardSort) ?? "overall";
    const ok = await setupBoard(channelId, tab);
    return {
      content: ok
        ? "✅ Live leaderboard posted in this channel — it refreshes after every match. Run this again anywhere to move it."
        : "Couldn't post here. Check that the bot can send messages in this channel and that DISCORD_BOT_TOKEN is set.",
    };
  }

  if (name === "leaderboard") {
    const tab = (opt("tab") as LeaderboardSort) ?? "overall";
    const { ranked, provisional } = await getLeaderboard(tab);
    return { embeds: [leaderboardEmbed(tab, ranked, provisional)] };
  }

  if (name === "rank" || name === "lastmatch") {
    const targetId = (opt("user") as string) ?? callerId;
    if (!targetId) return { content: "Couldn't identify a Discord user." };

    const player = await getPlayerByDiscordId(targetId);
    if (!player) {
      const who = opt("user") ? "That player isn't" : "You're not";
      return { content: `${who} linked yet — link at https://amongus25.com/link` };
    }

    if (name === "rank") return { embeds: [rankEmbed(player)] };

    const mp = await getLastMatchFor(player.id);
    if (!mp) return { content: `${player.displayName} has no recorded matches yet.` };
    return {
      embeds: [
        lastMatchEmbed({
          playerName: player.displayName,
          role: mp.role,
          won: mp.won,
          eloDelta: mp.eloDelta,
          outcome: mp.match.outcome,
          map: mp.match.map,
          startedAt: mp.match.startedAt,
        }),
      ],
    };
  }

  return { content: "Unknown command." };
}

// Edit the deferred response with the real content. Authorized by the interaction token (no bot
// token needed). Bounded so a slow Discord call can't hang the background task indefinitely.
async function sendFollowup(token: string, payload: Followup): Promise<void> {
  const appId = process.env.DISCORD_APP_ID;
  if (!appId) return;
  await fetch(`${DISCORD_API}/webhooks/${appId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(2500),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  // Verify Discord's Ed25519 signature over the RAW body before anything else (also how Discord
  // validates the endpoint on setup). Reject unverifiable requests with 401.
  const raw = await req.text();
  const ok = verifyDiscordSignature(
    raw,
    req.headers.get("x-signature-ed25519"),
    req.headers.get("x-signature-timestamp"),
    process.env.DISCORD_PUBLIC_KEY,
  );
  if (!ok) return new NextResponse("invalid request signature", { status: 401 });

  const body = JSON.parse(raw);
  if (body.type === 1) return NextResponse.json({ type: 1 }); // PING -> PONG
  if (body.type !== 2) return new NextResponse("unhandled", { status: 400 });

  const name: string = body.data?.name ?? "";
  const callerId: string | undefined = body.member?.user?.id ?? body.user?.id;
  const channelId: string = body.channel_id ?? "";
  const options: Opt[] = body.data?.options ?? [];

  // /tiers is pure (no I/O) — answer instantly with a normal reply.
  if (name === "tiers") return NextResponse.json({ type: 4, data: { embeds: [tiersEmbed()] } });

  // DB-backed commands: ACK immediately (a deferred type-5, well inside Discord's 3s window even on
  // a cold start), then deliver via a followup so query latency can't miss the deadline.
  // setup-leaderboard's confirmation is ephemeral (admin-only); the rest are public.
  const token: string = body.token;
  const ephemeral = name === "setup-leaderboard";
  after(async () => {
    try {
      await sendFollowup(token, await buildResponse(name, options, callerId, channelId));
    } catch {
      await sendFollowup(token, { content: "Something went wrong — try again in a moment." });
    }
  });
  return NextResponse.json({ type: 5, data: ephemeral ? { flags: 64 } : {} });
}
