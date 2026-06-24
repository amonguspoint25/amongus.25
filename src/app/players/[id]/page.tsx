import { prisma } from "@/lib/db";
import { tierFor } from "@/lib/rank";
import { PLACEMENT_GAMES } from "@/lib/elo/placement";
import Link from "next/link";
import { CountUp } from "@/components/CountUp";
import { Sparkline } from "@/components/Sparkline";
import { TiltCard } from "@/components/TiltCard";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch player with 2 queries: recent matches (last 10 desc) + ELO history (last 30 asc)
  const [p, historyParticipants] = await Promise.all([
    prisma.player.findUnique({
      where: { id },
      include: {
        participants: {
          include: { match: true },
          orderBy: { match: { startedAt: "desc" } },
          take: 10,
        },
      },
    }),
    prisma.matchParticipant.findMany({
      where: { playerId: id },
      orderBy: { match: { startedAt: "asc" } },
      take: 30,
      select: { eloAfter: true },
    }),
  ]);

  if (!p) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <p style={{ color: "var(--muted)" }}>Player not found.</p>
        <Link href="/leaderboard" style={{ color: "var(--primary)" }}>← Back to leaderboard</Link>
      </main>
    );
  }

  const winRate = p.games ? Math.round(((p.crewWins + p.impWins) / p.games) * 100) : 0;
  const tier = tierFor(p.overallElo);
  const provisional = p.games < PLACEMENT_GAMES;
  const isTopImpostor = tier.name === "Top Impostor";
  const sparkPoints = historyParticipants.map((h) => h.eloAfter);

  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/leaderboard" className="eyebrow" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
      <p className="eyebrow mt-4 mb-1">// OPERATIVE DOSSIER</p>
      <h1 className="text-4xl font-extrabold mt-2">{p.displayName}</h1>
      <div className="mt-2 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={tier.image} alt="" width={48} height={48} />
        <span>
          {provisional ? (
            <span
              className="eyebrow"
              style={{ color: "var(--muted)", border: "1px solid var(--line)", padding: "2px 8px" }}
            >
              PROVISIONAL · {p.games}/{PLACEMENT_GAMES} placements
            </span>
          ) : (
            <span style={{ color: isTopImpostor ? "var(--alert)" : "var(--signal)" }}>{tier.name}</span>
          )}
          {" · "}Overall{" "}
          <span className="glow-num">
            <CountUp value={Math.round(p.overallElo)} />
          </span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-8">
        <StatCountUp label="Crew ELO" v={Math.round(p.crewElo)} />
        <StatCountUp label="Impostor ELO" v={Math.round(p.impElo)} />
        <TiltCard>
          <div className="hud-panel" style={{ padding: "1rem" }}>
            <div className="eyebrow mb-1">Win rate</div>
            <div className="glow-num text-2xl font-semibold mt-1">{winRate}%</div>
          </div>
        </TiltCard>
        <StatCountUp label="Games" v={p.games} />
        <StatCountUp label="Kills" v={p.kills} />
        <StatCountUp label="Tasks done" v={p.tasksDone} />
        <StatCountUp label="Correct shots" v={p.correctShots} />
        <StatCountUp label="Incorrect shots" v={p.incorrectShots} />
        <StatCountUp label="Crew wins" v={p.crewWins} />
        <StatCountUp label="Impostor wins" v={p.impWins} />
      </div>

      {/* ELO History Sparkline */}
      <div className="hud-panel" style={{ padding: "1.25rem", marginBottom: "2rem" }}>
        <p className="eyebrow mb-3">// RATING HISTORY</p>
        {sparkPoints.length >= 2 ? (
          <Sparkline points={sparkPoints} stroke="var(--ion)" width={560} height={72} />
        ) : (
          <p className="data" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
            Not enough matches to chart yet.
          </p>
        )}
      </div>

      <h2 className="text-xl font-bold mb-3">Recent matches</h2>
      <div className="hud-panel" style={{ overflow: "hidden" }}>
        {p.participants.length === 0 && (
          <p className="data p-4" style={{ color: "var(--muted)" }}>No matches yet.</p>
        )}
        {p.participants.map((mp) => {
          const up = mp.eloDelta >= 0;
          const isImpostor = mp.role === "IMPOSTOR";
          return (
            <div
              key={mp.id}
              className="flex items-center justify-between p-3 border-t"
              style={{ borderColor: "var(--line)" }}
            >
              <span className="data" style={{ color: isImpostor ? "var(--alert)" : "var(--ok)" }}>
                {isImpostor ? "🔪 Impostor" : "🛠️ Crew"}
              </span>
              <span className="data" style={{ color: "var(--muted)" }}>{mp.won ? "Win" : "Loss"}</span>
              <span className="glow-num" style={{ color: up ? "var(--signal)" : "var(--alert)" }}>
                {up ? "+" : ""}{Math.round(mp.eloDelta)} ELO
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function StatCountUp({ label, v }: { label: string; v: number }) {
  return (
    <TiltCard>
      <div className="hud-panel" style={{ padding: "1rem" }}>
        <div className="eyebrow mb-1">{label}</div>
        <div className="glow-num text-2xl font-semibold mt-1">
          <CountUp value={v} />
        </div>
      </div>
    </TiltCard>
  );
}
