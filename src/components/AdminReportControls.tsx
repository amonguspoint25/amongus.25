"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type BM = { id: string; round: number; playerAId?: string | null; playerBId?: string | null; winnerId?: string | null };

export function AdminReportControls({ tournamentId, matches, names }: { tournamentId: string; matches: BM[]; names: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = matches.filter((m) => !m.winnerId && m.playerAId && m.playerBId);

  async function report(bracketMatchId: string, winnerId: string) {
    setBusy(bracketMatchId);
    await fetch(`/api/tournaments/${tournamentId}/report`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bracketMatchId, winnerId }),
    });
    setBusy(null);
    router.refresh();
  }

  if (pending.length === 0) {
    return <p className="mt-10 text-sm" style={{ color: "var(--muted)" }}>Admin: no matches awaiting results.</p>;
  }
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold mb-3">Admin · report results</h2>
      <div className="space-y-3">
        {pending.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-lg p-3" style={{ background: "var(--surface)" }}>
            <span className="text-sm" style={{ color: "var(--muted)" }}>R{m.round}</span>
            {[m.playerAId!, m.playerBId!].map((pid) => (
              <button key={pid} disabled={busy === m.id} onClick={() => report(m.id, pid)}
                className="px-3 py-1.5 rounded-lg" style={{ background: "var(--primary)", color: "white", opacity: busy === m.id ? 0.5 : 1 }}>
                {names[pid] ?? "?"} wins
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
