import { prisma } from "@/lib/db";
import { tierFor } from "@/lib/rank";
import Link from "next/link";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await prisma.player.findUnique({
    where: { id },
    include: {
      participants: {
        include: { match: true },
        orderBy: { match: { startedAt: "desc" } },
        take: 10,
      },
    },
  });
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
  const isTopImpostor = tier.name === "Top Impostor";
  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/leaderboard" className="eyebrow" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
      <p className="eyebrow mt-4 mb-1">// OPERATIVE DOSSIER</p>
      <h1 className="text-4xl font-extrabold mt-2">{p.displayName}</h1>
      <div className="mt-2 flex items-center gap-3">
        <img src={tier.image} alt="" width={48} height={48} />
        <span>
          <span style={{ color: isTopImpostor ? "var(--alert)" : "var(--signal)" }}>{tier.name}</span>
          {" · "}Overall <span className="glow-num">{Math.round(p.overallElo)}</span>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-8">
        <Stat label="Crew ELO" v={Math.round(p.crewElo)} />
        <Stat label="Impostor ELO" v={Math.round(p.impElo)} />
        <Stat label="Win rate" v={winRate + "%"} />
        <Stat label="Games" v={p.games} />
        <Stat label="Kills" v={p.kills} />
        <Stat label="Tasks done" v={p.tasksDone} />
        <Stat label="Correct shots" v={p.correctShots} />
        <Stat label="Incorrect shots" v={p.incorrectShots} />
        <Stat label="Crew wins" v={p.crewWins} />
        <Stat label="Impostor wins" v={p.impWins} />
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

function Stat({ label, v }: { label: string; v: string | number }) {
  return (
    <div className="hud-panel" style={{ padding: "1rem" }}>
      <div className="eyebrow mb-1">{label}</div>
      <div className="glow-num text-2xl font-semibold mt-1">{v}</div>
    </div>
  );
}
