"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

type NavItem = { label: string; href: string };
type PlayerItem = { label: string; href: string };
type ResultItem = { label: string; href: string; group: string };

const STATIC_NAV: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Rankings", href: "/leaderboard" },
  { label: "Tournaments", href: "/tournaments" },
  { label: "Link", href: "/link" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const loadPlayers = useCallback(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    fetch("/api/leaderboard?sort=overall")
      .then((r) => r.json())
      .then((data: { id: string; name: string }[]) => {
        setPlayers(data.map((p) => ({ label: p.name, href: `/players/${p.id}` })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => {
          if (!prev) loadPlayers();
          return !prev;
        });
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [loadPlayers]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
      setQuery("");
      setHighlightIdx(0);
    }
  }, [open]);

  const filteredResults: ResultItem[] = (() => {
    const q = query.toLowerCase();
    const navItems = STATIC_NAV.filter((n) => n.label.toLowerCase().includes(q) || q === "").map(
      (n) => ({ ...n, group: "Navigation" })
    );
    const playerItems = players
      .filter((p) => p.label.toLowerCase().includes(q))
      .map((p) => ({ ...p, group: "Players" }));
    return [...navItems, ...playerItems];
  })();

  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIdx((i) => Math.min(i + 1, filteredResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = filteredResults[highlightIdx];
        if (item) {
          router.push(item.href);
          setOpen(false);
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, filteredResults, highlightIdx, router]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "clamp(4rem, 12vh, 9rem)",
        background: "rgba(5, 7, 13, 0.78)",
        backdropFilter: "blur(6px)",
        animation: reducedMotion ? "none" : "paletteIn 0.15s cubic-bezier(0.16,1,0.3,1) both",
      }}
      onClick={() => setOpen(false)}
      aria-modal
      role="dialog"
      aria-label="Command palette"
    >
      <style>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
      <div
        className="hud-panel hud-corners"
        style={{
          width: "min(600px, 92vw)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <span className="eyebrow" style={{ flexShrink: 0 }}>// SEARCH</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or name..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              fontFamily: "var(--font-mono), ui-monospace, monospace",
              fontSize: "0.95rem",
              color: "var(--text)",
            }}
            aria-autocomplete="list"
            aria-controls="palette-results"
          />
        </div>

        {/* Results */}
        <ul
          id="palette-results"
          role="listbox"
          style={{
            flex: 1,
            overflowY: "auto",
            listStyle: "none",
            margin: 0,
            padding: "0.25rem 0",
          }}
        >
          {filteredResults.length === 0 && (
            <li className="data" style={{ padding: "0.75rem 1rem", color: "var(--muted)" }}>
              No results.
            </li>
          )}
          {filteredResults.map((item, idx) => (
            <li
              key={item.href + item.group}
              role="option"
              aria-selected={idx === highlightIdx}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.5rem 1rem",
                cursor: "pointer",
                background: idx === highlightIdx ? "rgba(61, 139, 255, 0.1)" : "transparent",
                borderLeft: idx === highlightIdx ? "2px solid var(--ion)" : "2px solid transparent",
                transition: "background 0.08s",
              }}
              onMouseEnter={() => setHighlightIdx(idx)}
              onClick={() => {
                router.push(item.href);
                setOpen(false);
              }}
            >
              <span className="eyebrow" style={{ color: "var(--muted)", minWidth: "6rem" }}>
                {item.group}
              </span>
              <span className="data" style={{ color: "var(--text)" }}>{item.label}</span>
            </li>
          ))}
        </ul>

        {/* Footer hint */}
        <div
          className="eyebrow"
          style={{
            padding: "0.5rem 1rem",
            borderTop: "1px solid var(--line)",
            color: "var(--muted)",
            fontSize: "0.65rem",
          }}
        >
          ↑↓ navigate · ↵ open · esc close
        </div>
      </div>
    </div>
  );
}
