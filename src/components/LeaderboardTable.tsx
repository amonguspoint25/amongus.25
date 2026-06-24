"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { tierFor } from "@/lib/rank";

type Row = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number };

export function LeaderboardTable() {
  const [sort, setSort] = useState("overall");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let on = true;
    const load = () =>
      fetch(`/api/leaderboard?sort=${sort}`).then((r) => r.json()).then((d) => { if (on) setRows(d); });
    load();
    const id = setInterval(load, 15000);
    return () => { on = false; clearInterval(id); };
  }, [sort]);

  const tabs: { key: string; label: string }[] = [
    { key: "overall", label: "Overall" }, { key: "crew", label: "Crew" }, { key: "imp", label: "Impostor" },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setSort(t.key)}
            className="px-4 py-2 rounded-lg transition-colors"
            style={{ background: sort === t.key ? "var(--primary)" : "var(--surface)", color: "var(--text)" }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)" }}>
        <table className="w-full text-left">
          <thead>
            <tr className="text-sm" style={{ color: "var(--muted)" }}>
              <th className="p-3">#</th><th className="p-3">Player</th><th className="p-3">Tier</th>
              <th className="p-3">Crew</th><th className="p-3">Imp</th><th className="p-3">Overall</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                <td className="p-3">{i + 1}</td>
                <td className="p-3">
                  <Link href={`/players/${r.id}`} className="hover:underline" style={{ color: "var(--primary)" }}>{r.name}</Link>
                </td>
                <td className="p-3">{tierFor(r.overallElo).name}</td>
                <td className="p-3">{r.crewElo}</td><td className="p-3">{r.impElo}</td>
                <td className="p-3 font-semibold">{r.overallElo}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="p-6" colSpan={6} style={{ color: "var(--muted)" }}>No players yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
