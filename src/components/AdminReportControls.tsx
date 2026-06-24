"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type BM = { id: string; round: number; playerAId?: string | null; playerBId?: string | null; winnerId?: string | null };

const BTN_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)";

export function AdminReportControls({ tournamentId, matches, names }: { tournamentId: string; matches: BM[]; names: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pending = matches.filter((m) => !m.winnerId && m.playerAId && m.playerBId);

  async function report(bracketMatchId: string, winnerId: string) {
    setBusy(bracketMatchId);
    setErr(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/report`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bracketMatchId, winnerId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? `Failed to report result (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error reporting result.");
    } finally {
      setBusy(null);
    }
  }

  if (pending.length === 0) {
    return <p className="data mt-10 text-sm" style={{ color: "var(--muted)" }}>Admin: no matches awaiting results.</p>;
  }
  return (
    <section className="mt-10">
      <p className="eyebrow mb-3">// REPORT RESULTS</p>
      {err && <p className="data mb-3 text-sm" style={{ color: "var(--alert)" }}>{err}</p>}
      <div className="hud-panel" style={{ padding: "1.25rem" }}>
        <div className="space-y-3">
          {pending.map((m) => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="eyebrow">R{m.round}</span>
              {[m.playerAId!, m.playerBId!].map((pid) => (
                <button
                  key={pid}
                  disabled={busy === m.id}
                  onClick={() => report(m.id, pid)}
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontSize: "0.8rem",
                    letterSpacing: "0.06em",
                    clipPath: BTN_CLIP,
                    padding: "8px 18px",
                    cursor: busy === m.id ? "not-allowed" : "pointer",
                    border: "none",
                    background: "var(--ion)",
                    color: "#04060b",
                    fontWeight: 700,
                    boxShadow: "var(--glow)",
                    opacity: busy === m.id ? 0.5 : 1,
                    transition: "opacity 0.15s",
                  }}
                >
                  {names[pid] ?? "?"} wins
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
