"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type P = { id: string; displayName: string };

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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament name"
        className="w-full rounded-lg p-3" style={{ background: "var(--surface)", color: "var(--text)" }} />
      <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="url-slug"
        className="w-full rounded-lg p-3" style={{ background: "var(--surface)", color: "var(--text)" }} />
      <div>
        <p className="mb-2 text-sm" style={{ color: "var(--muted)" }}>Players ({sel.length} selected, need ≥2)</p>
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {players.map((p) => (
            <button type="button" key={p.id} onClick={() => toggle(p.id)} className="rounded-lg p-2 text-left"
              style={{ background: sel.includes(p.id) ? "var(--primary)" : "var(--surface)", color: sel.includes(p.id) ? "white" : "var(--text)" }}>
              {p.displayName}
            </button>
          ))}
        </div>
      </div>
      {err && <p style={{ color: "#ff6b6b" }}>{err}</p>}
      <button type="submit" disabled={disabled} className="px-5 py-2.5 rounded-lg font-semibold"
        style={{ background: "var(--primary)", color: "white", opacity: disabled ? 0.5 : 1 }}>
        Create tournament
      </button>
    </form>
  );
}
