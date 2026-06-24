"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { tierFor } from "@/lib/rank";

type Row = { id: string; name: string; crewElo: number; impElo: number; overallElo: number; games: number };

const TAB_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%)";

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
    { key: "overall", label: "OVERALL" }, { key: "crew", label: "CREW" }, { key: "imp", label: "IMP" },
  ];

  return (
    <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
      <div className="flex gap-2 mb-5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSort(t.key)}
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "0.75rem",
              letterSpacing: "0.12em",
              clipPath: TAB_CLIP,
              padding: "6px 14px",
              cursor: "pointer",
              border: sort === t.key ? "none" : "1px solid var(--line)",
              background: sort === t.key ? "var(--ion)" : "transparent",
              color: sort === t.key ? "#04060b" : "var(--muted)",
              fontWeight: sort === t.key ? 700 : 400,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <table className="w-full text-left">
        <thead>
          <tr>
            <th className="eyebrow p-3">#</th>
            <th className="eyebrow p-3">OPERATIVE</th>
            <th className="eyebrow p-3">TIER</th>
            <th className="eyebrow p-3">CREW</th>
            <th className="eyebrow p-3">IMP</th>
            <th className="eyebrow p-3">OVERALL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const tier = tierFor(r.overallElo);
            const isTopImpostor = tier.name === "Top Impostor";
            return (
              <tr
                key={r.id}
                className="border-t"
                style={{
                  borderColor: "var(--line)",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(61,139,255,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <td className="data p-3" style={{ color: "var(--muted)" }}>{i + 1}</td>
                <td className="p-3">
                  <Link
                    href={`/players/${r.id}`}
                    style={{ color: "var(--text)", transition: "color 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "var(--signal)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text)")}
                  >
                    {r.name}
                  </Link>
                </td>
                <td className="data p-3">
                  <span className="inline-flex items-center gap-2">
                    <img src={tier.image} alt="" width={22} height={22} />
                    <span style={{ color: isTopImpostor ? "var(--alert)" : "var(--text)" }}>{tier.name}</span>
                  </span>
                </td>
                <td className="data p-3"><span className="glow-num">{r.crewElo}</span></td>
                <td className="data p-3"><span className="glow-num">{r.impElo}</span></td>
                <td className="data p-3">
                  <span className="glow-num" style={{ color: "var(--signal)", textShadow: "var(--glow-cyan)" }}>{r.overallElo}</span>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No players yet.</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="eyebrow mt-4" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        // LIVE · REFRESH 15s <span className="live-dot" />
      </p>
    </div>
  );
}
