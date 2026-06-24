"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type P = { id: string; displayName: string };

const BTN_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)";
const INPUT_STYLE = {
  background: "var(--hud)",
  border: "1px solid var(--line)",
  color: "var(--text)",
  fontFamily: "var(--font-mono), ui-monospace, monospace",
  fontVariantNumeric: "tabular-nums" as const,
  padding: "0.75rem",
  width: "100%",
  outline: "none",
};

export function CreateTournamentForm({ players }: { players: P[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/tournaments", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, slug, playerIds: sel }),
    });
    if (res.ok) {
      const d = await res.json();
      router.push(`/tournaments/${d.slug}`);
    } else {
      const d = await res.json().catch(() => ({}));
      setErr(d.error ?? "failed to create");
    }
  }

  const disabled = sel.length < 2 || !name || !slug;
  return (
    <form onSubmit={submit} className="space-y-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tournament name"
        style={INPUT_STYLE}
      />
      <input
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
        placeholder="url-slug"
        style={INPUT_STYLE}
      />
      <div>
        <p className="eyebrow mb-2">Players ({sel.length} selected, need ≥2)</p>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {players.map((p) => {
            const isSelected = sel.includes(p.id);
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                style={{
                  fontFamily: "var(--font-mono), ui-monospace, monospace",
                  fontSize: "0.82rem",
                  clipPath: BTN_CLIP,
                  padding: "8px 12px",
                  textAlign: "left",
                  cursor: "pointer",
                  border: isSelected ? "none" : "1px solid var(--line)",
                  background: isSelected ? "var(--ion)" : "transparent",
                  color: isSelected ? "#04060b" : "var(--text)",
                  fontWeight: isSelected ? 700 : 400,
                  transition: "all 0.12s",
                }}
              >
                {p.displayName}
              </button>
            );
          })}
        </div>
      </div>
      {err && <p className="data text-sm" style={{ color: "var(--alert)" }}>{err}</p>}
      <button
        type="submit"
        disabled={disabled}
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: "0.85rem",
          letterSpacing: "0.1em",
          clipPath: BTN_CLIP,
          padding: "10px 24px",
          cursor: disabled ? "not-allowed" : "pointer",
          border: "none",
          background: "var(--ion)",
          color: "#04060b",
          fontWeight: 700,
          boxShadow: "var(--glow)",
          opacity: disabled ? 0.45 : 1,
          transition: "opacity 0.15s",
        }}
      >
        CREATE TOURNAMENT
      </button>
    </form>
  );
}
