"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { tierFor, isApexTier } from "@/lib/rank";

type Row = {
  id: string; name: string;
  crewElo: number; impElo: number; overallElo: number;
  games: number; gamesInRole: number; needed: number;
};

const TAB_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%)";

export function LeaderboardTable() {
  const [sort, setSort] = useState("overall");
  const [board, setBoard] = useState("current");
  const [seasons, setSeasons] = useState<{ number: number; active: boolean }[]>([]);
  const [ranked, setRanked] = useState<Row[]>([]);
  const [provisional, setProvisional] = useState<Row[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let on = true;
    fetch("/api/seasons").then((r) => r.json()).then((d) => { if (on) setSeasons(d.seasons ?? []); });
    return () => { on = false; };
  }, []);

  useEffect(() => {
    let on = true;
    const load = () =>
      fetch(`/api/leaderboard?board=${board}&sort=${sort}`)
        .then((r) => r.json())
        .then((d) => {
          if (!on) return;
          setRanked(d.ranked ?? []);
          setProvisional(d.provisional ?? []);
        });
    load();
    const id = setInterval(load, 15000);
    return () => { on = false; clearInterval(id); };
  }, [sort, board]);

  const tabs: { key: string; label: string }[] = [
    { key: "overall", label: "OVERALL" }, { key: "crew", label: "CREW" }, { key: "imp", label: "IMP" },
  ];

  const matches = (r: Row) => r.name.toLowerCase().includes(search.toLowerCase());
  const filteredRanked = ranked.filter(matches);
  const filteredProvisional = provisional.filter(matches);

  return (
    <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
      <div className="flex gap-2 mb-4" style={{ flexWrap: "wrap" }}>
        {[
          { key: "current", label: "CURRENT SEASON" },
          { key: "all-time", label: "ALL-TIME" },
          ...seasons.filter((s) => !s.active).map((s) => ({ key: `season-${s.number}`, label: `SEASON ${s.number}` })),
        ].map((b) => (
          <button
            key={b.key}
            onClick={() => setBoard(b.key)}
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "0.7rem", letterSpacing: "0.12em", padding: "5px 12px", cursor: "pointer",
              border: board === b.key ? "none" : "1px solid var(--line)",
              background: board === b.key ? "var(--signal)" : "transparent",
              color: board === b.key ? "#04060b" : "var(--muted)",
              fontWeight: board === b.key ? 700 : 400,
            }}
          >
            {b.label}
          </button>
        ))}
      </div>
      {/* Search input */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="// SEARCH OPERATIVES"
          aria-label="Search players"
          style={{
            width: "100%",
            background: "var(--hud)",
            border: "1px solid var(--line)",
            color: "var(--text)",
            fontFamily: "var(--font-mono), ui-monospace, monospace",
            fontSize: "0.8rem",
            letterSpacing: "0.1em",
            padding: "0.45rem 0.75rem",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>
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
          {filteredRanked.map((r, i) => {
            const tier = tierFor(r.overallElo);
            const isElite = isApexTier(tier.name);
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
                    <span style={{ color: isElite ? tier.glow : "var(--text)" }}>{tier.name}</span>
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
          {filteredRanked.length === 0 && ranked.length > 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No operatives match.</td>
            </tr>
          )}
          {ranked.length === 0 && provisional.length === 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No players yet.</td>
            </tr>
          )}
          {ranked.length === 0 && provisional.length > 0 && (
            <tr>
              <td className="data p-6" colSpan={6} style={{ color: "var(--muted)" }}>No ranked operatives yet — placements in progress.</td>
            </tr>
          )}
        </tbody>
      </table>
      {filteredProvisional.length > 0 && (
        <div style={{ marginTop: "1.5rem" }}>
          <p className="eyebrow mb-2" style={{ color: "var(--muted)" }}>
            // PROVISIONAL · NEED {filteredProvisional[0].needed} GAMES
          </p>
          <div className="grid gap-1">
            {filteredProvisional.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between px-3 py-2"
                style={{ border: "1px solid var(--line)", color: "var(--muted)", opacity: 0.85 }}
              >
                <Link
                  href={`/players/${r.id}`}
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted)")}
                >
                  {r.name}
                </Link>
                <span className="data" style={{ fontSize: "0.8rem" }}>
                  {r.gamesInRole}/{r.needed} games
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="eyebrow mt-4" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        // LIVE · REFRESH 15s <span className="live-dot" />
      </p>
    </div>
  );
}
