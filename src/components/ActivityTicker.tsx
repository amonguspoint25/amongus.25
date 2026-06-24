"use client";
import { useEffect, useRef, useState } from "react";

type ActivityItem = {
  name: string;
  role: "CREW" | "IMPOSTOR";
  won: boolean;
  eloDelta: number;
  code: string;
};

export function ActivityTicker() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((data: ActivityItem[]) => setItems(data))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  const tickerItems = [...items, ...items];

  return (
    <div
      style={{
        borderTop: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <style>{`
        @keyframes ticker {
          to { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          gap: 0;
          white-space: nowrap;
          animation: ticker 40s linear infinite;
          will-change: transform;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .ticker-track {
            animation: none;
            overflow-x: auto;
            flex-wrap: nowrap;
          }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.4rem 1rem",
          background: "rgba(11, 19, 32, 0.85)",
          backdropFilter: "blur(4px)",
        }}
      >
        <span className="eyebrow" style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
          // LIVE FEED <span className="live-dot" />
        </span>
        <div
          style={{ overflow: "hidden", flex: 1, minWidth: 0 }}
          aria-live="off"
          aria-atomic="false"
        >
          <div className={reducedMotion ? "" : "ticker-track"} style={reducedMotion ? { overflowX: "auto", display: "flex", gap: 0, whiteSpace: "nowrap" } : {}}>
            {tickerItems.map((item, idx) => {
              const isImp = item.role === "IMPOSTOR";
              const positive = item.eloDelta >= 0;
              return (
                <span
                  key={idx}
                  className="data"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0 1.25rem",
                    fontSize: "0.72rem",
                    borderRight: "1px solid var(--line)",
                  }}
                >
                  <span style={{ color: "var(--muted)" }}>{item.name}</span>
                  <span style={{ color: "var(--line)" }}>·</span>
                  <span style={{ color: isImp ? "var(--alert)" : "var(--ok)", fontWeight: 600 }}>
                    {isImp ? "IMP" : "CREW"}
                  </span>
                  <span style={{ color: "var(--line)" }}>·</span>
                  <span style={{ color: item.won ? "var(--ok)" : "var(--muted)" }}>
                    {item.won ? "WIN" : "LOSS"}
                  </span>
                  <span
                    className="glow-num"
                    style={{
                      color: positive ? "var(--signal)" : "var(--alert)",
                      textShadow: positive ? "var(--glow-cyan)" : "none",
                    }}
                  >
                    {positive ? "+" : ""}{item.eloDelta}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
