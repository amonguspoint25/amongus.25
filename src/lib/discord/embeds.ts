import { tierFor, TIERS, isApexTier } from "@/lib/rank";
import { isProvisional, PLACEMENT_GAMES } from "@/lib/elo/placement";
import type { LeaderboardRow, LeaderboardSort } from "@/lib/leaderboard";

// Badge images live on the production site; embeds reference them by absolute URL.
const SITE = "https://amongus25.com";
const NEUTRAL = 0x4dd0e0; // brand cyan, used when no tier color applies

function colorOf(hexGlow: string): number {
  const n = parseInt(hexGlow.replace("#", ""), 16);
  return Number.isNaN(n) ? NEUTRAL : n; // not `|| NEUTRAL` — #000000 (0) is a valid color
}

function tierVisual(overallElo: number) {
  const t = tierFor(overallElo);
  return { name: t.name, badge: SITE + t.image, color: colorOf(t.glow) };
}

function sortLabel(s: LeaderboardSort): string {
  return s === "crew" ? "Crew" : s === "imp" ? "Impostor" : "Overall";
}
function eloFor(r: LeaderboardRow, s: LeaderboardSort): number {
  return s === "crew" ? r.crewElo : s === "imp" ? r.impElo : r.overallElo;
}

export function leaderboardEmbed(sort: LeaderboardSort, ranked: LeaderboardRow[], provisional: LeaderboardRow[]) {
  const top = ranked.slice(0, 10);
  const lines = top.map((r, i) => {
    const tier = tierFor(r.overallElo).name;
    return `**${i + 1}.** ${r.name} — ${Math.round(eloFor(r, sort))}  ·  ${tier}`;
  });
  return {
    title: `🏆 Leaderboard — ${sortLabel(sort)}`,
    description: lines.length ? lines.join("\n") : "No ranked players yet — play your placement games!",
    color: top.length ? tierVisual(top[0].overallElo).color : NEUTRAL,
    footer: { text: `${provisional.length} player(s) still in placement · amongus25.com/leaderboard` },
  };
}

type RankPlayer = {
  displayName: string;
  crewElo: number; impElo: number; overallElo: number;
  games: number; crewWins: number; impWins: number; kills: number;
};

export function rankEmbed(p: RankPlayer) {
  const provisional = p.games < PLACEMENT_GAMES;
  const winRate = p.games ? Math.round(((p.crewWins + p.impWins) / p.games) * 100) : 0;
  const v = tierVisual(p.overallElo);
  return {
    title: p.displayName,
    description: provisional
      ? `**PROVISIONAL** · ${p.games}/${PLACEMENT_GAMES} placement games`
      : `Tier: **${v.name}**`,
    color: v.color,
    thumbnail: { url: v.badge },
    fields: [
      { name: "Overall", value: `${Math.round(p.overallElo)}`, inline: true },
      { name: "Crew", value: `${Math.round(p.crewElo)}`, inline: true },
      { name: "Impostor", value: `${Math.round(p.impElo)}`, inline: true },
      { name: "Win rate", value: `${winRate}%`, inline: true },
      { name: "Games", value: `${p.games}`, inline: true },
      { name: "Kills", value: `${p.kills}`, inline: true },
    ],
    footer: { text: "amongus25.com" },
  };
}

type LastMatch = {
  playerName: string;
  role: "CREW" | "IMPOSTOR";
  won: boolean;
  eloDelta: number;
  outcome: "CREW_WIN" | "IMP_WIN";
  map: string | null;
  startedAt: Date;
};

export function lastMatchEmbed(m: LastMatch) {
  const delta = Math.round(m.eloDelta);
  const sign = delta >= 0 ? "+" : "";
  return {
    title: `${m.playerName} — last match`,
    description:
      `${m.outcome === "IMP_WIN" ? "🔪 Impostors win" : "🛠️ Crew win"}\n` +
      `Role: **${m.role === "IMPOSTOR" ? "Impostor" : "Crew"}** · ${m.won ? "✅ Win" : "❌ Loss"}\n` +
      `ELO: **${sign}${delta}**`,
    color: m.won ? 0x57f287 : 0xed4245,
    footer: { text: `${m.map ?? "—"} · ${m.startedAt.toISOString().slice(0, 10)}` },
  };
}

export function tiersEmbed() {
  const lines = [...TIERS].reverse().map((t) => {
    const mark = isApexTier(t.name) ? "⭐ " : "";
    return `${mark}**${t.name}** — ${t.min}+`;
  });
  return {
    title: "Rank tiers",
    description: lines.join("\n"),
    color: NEUTRAL,
    footer: { text: "First 10 games are placement (capped at Gold) · amongus25.com" },
  };
}

type AnnounceResult = { name: string; role: "CREW" | "IMPOSTOR"; eloDelta: number };

export function matchAnnounceEmbed(outcome: "CREW_WIN" | "IMP_WIN", map: string | null, results: AnnounceResult[]) {
  const line = (r: AnnounceResult) => {
    const d = Math.round(r.eloDelta);
    return `${r.role === "IMPOSTOR" ? "🔪" : "🛠️"} ${r.name} — ${d >= 0 ? "+" : ""}${d}`;
  };
  // Winners (positive deltas) first for a tidy readout.
  const sorted = [...results].sort((a, b) => b.eloDelta - a.eloDelta);
  return {
    title: outcome === "IMP_WIN" ? "🔪 Impostors win" : "🛠️ Crew win",
    description: sorted.map(line).join("\n") || "Match recorded.",
    color: outcome === "IMP_WIN" ? 0xed4245 : 0x57f287,
    footer: { text: `${map ?? "—"} · amongus25.com/matches` },
  };
}
