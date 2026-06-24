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
  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/leaderboard" className="text-sm" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
      <h1 className="text-4xl font-extrabold mt-2">{p.displayName}</h1>
      <div className="mt-2 flex items-center gap-3">
        <img src={tierFor(p.overallElo).image} alt="" width={48} height={48} />
        <span style={{ color: "var(--accent)" }}>{tierFor(p.overallElo).name} · Overall {Math.round(p.overallElo)}</span>
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
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)" }}>
        {p.participants.length === 0 && (
          <p className="p-4" style={{ color: "var(--muted)" }}>No matches yet.</p>
        )}
        {p.participants.map((mp) => {
          const up = mp.eloDelta >= 0;
          return (
            <div key={mp.id} className="flex items-center justify-between p-3 border-t"
              style={{ borderColor: "rgba(255,255,255,0.06)" }}>
              <span>{mp.role === "IMPOSTOR" ? "🔪 Impostor" : "🛠️ Crew"}</span>
              <span style={{ color: "var(--muted)" }}>{mp.won ? "Win" : "Loss"}</span>
              <span style={{ color: up ? "var(--accent)" : "#ff6b6b" }}>
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
    <div className="rounded-xl p-4" style={{ background: "var(--surface)" }}>
      <div className="text-sm" style={{ color: "var(--muted)" }}>{label}</div>
      <div className="text-2xl font-semibold mt-1">{v}</div>
    </div>
  );
}
