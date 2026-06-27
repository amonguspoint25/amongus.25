import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata = { title: "Matches — Among Us .25 Ranked" };
export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const matches = await prisma.match.findMany({
    orderBy: { startedAt: "desc" },
    take: 25,
    select: {
      id: true,
      map: true,
      outcome: true,
      startedAt: true,
      _count: { select: { participants: true } },
    },
  });

  return (
    <main className="max-w-3xl mx-auto p-8">
      <p className="eyebrow mb-1">// MATCH LOG</p>
      <h1 className="text-3xl font-extrabold mb-6">Recent matches</h1>
      <div className="hud-panel hud-corners" style={{ overflow: "hidden" }}>
        {matches.length === 0 && (
          <p className="data p-4" style={{ color: "var(--muted)" }}>No ranked matches yet.</p>
        )}
        {matches.map((m) => {
          const impWin = m.outcome === "IMP_WIN";
          return (
            <Link
              key={m.id}
              href={`/matches/${m.id}`}
              className="flex items-center justify-between p-3 border-t"
              style={{ borderColor: "var(--line)", color: "var(--text)" }}
            >
              <span className="data" style={{ color: impWin ? "var(--alert)" : "var(--ok)" }}>
                {impWin ? "🔪 Impostors" : "🛠️ Crew"} win
              </span>
              <span className="data" style={{ color: "var(--muted)" }}>
                {m.map ?? "—"} · {m._count.participants} players
              </span>
              <span className="data" style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                {m.startedAt.toLocaleDateString()}
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
