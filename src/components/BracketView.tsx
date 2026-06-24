type BM = { id: string; round: number; slotInRound: number; playerAId?: string | null; playerBId?: string | null; winnerId?: string | null };

export function BracketView({ matches, names }: { matches: BM[]; names: Record<string, string> }) {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  const label = (id?: string | null) => (id ? names[id] ?? "Unknown" : "TBD");
  return (
    <div className="flex gap-6 overflow-x-auto pb-4">
      {rounds.map((r) => (
        <div key={r} className="flex flex-col gap-4 min-w-[12rem]">
          <h3 className="text-sm uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {r === Math.max(...rounds) ? "Final" : `Round ${r}`}
          </h3>
          {matches.filter((m) => m.round === r).sort((a, b) => a.slotInRound - b.slotInRound).map((m) => (
            <div key={m.id} className="rounded-lg overflow-hidden" style={{ background: "var(--surface)" }}>
              <Row name={label(m.playerAId)} win={!!m.winnerId && m.winnerId === m.playerAId} />
              <Row name={label(m.playerBId)} win={!!m.winnerId && m.winnerId === m.playerBId} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Row({ name, win }: { name: string; win: boolean }) {
  return (
    <div className="px-3 py-2 border-b last:border-b-0"
      style={{ borderColor: "rgba(255,255,255,0.06)", color: win ? "var(--primary)" : "var(--text)", fontWeight: win ? 700 : 400 }}>
      {name}
    </div>
  );
}
