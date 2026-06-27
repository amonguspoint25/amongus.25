import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      participants: { include: { player: { select: { id: true, displayName: true } } } },
    },
  });
  if (!match) notFound();

  // Impostors first, then by ELO gained (best game on top within each side).
  const parts = [...match.participants].sort((a, b) =>
    a.role === b.role ? b.eloDelta - a.eloDelta : a.role === "IMPOSTOR" ? -1 : 1
  );
  const impWin = match.outcome === "IMP_WIN";

  return (
    <main className="max-w-2xl mx-auto p-8">
      <Link href="/matches" className="eyebrow" style={{ color: "var(--muted)" }}>← Matches</Link>
      <p className="eyebrow mt-4 mb-1">// MATCH RECORD</p>
      <h1 className="text-3xl font-extrabold mb-2" style={{ color: impWin ? "var(--alert)" : "var(--ok)" }}>
        {impWin ? "Impostors win" : "Crew win"}
      </h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        {match.map ?? "—"} · {match.startedAt.toLocaleString()}
      </p>

      <div className="hud-panel hud-corners" style={{ overflow: "hidden" }}>
        {parts.map((mp) => {
          const up = mp.eloDelta >= 0;
          const isImp = mp.role === "IMPOSTOR";
          return (
            <div
              key={mp.id}
              className="flex items-center justify-between p-3 border-t"
              style={{ borderColor: "var(--line)" }}
            >
              <Link href={`/players/${mp.player.id}`} className="data" style={{ color: "var(--text)" }}>
                {mp.player.displayName}
              </Link>
              <span className="data" style={{ color: isImp ? "var(--alert)" : "var(--ok)" }}>
                {isImp ? "Impostor" : "Crew"}{mp.won ? " · Win" : ""}
              </span>
              <span className="glow-num" style={{ color: up ? "var(--signal)" : "var(--alert)" }}>
                {up ? "+" : ""}{Math.round(mp.eloDelta)}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
