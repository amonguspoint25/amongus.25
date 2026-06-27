"use client";
import { useState } from "react";
import { mintHostKey } from "@/app/admin/hosts/actions";

export function HostKeyReveal({ userId }: { userId: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <form
        action={async () => {
          const r = await mintHostKey(userId, label);
          setRaw(r);
        }}
        style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (e.g. Cole PC)"
          className="data"
          style={{
            flex: "1 1 10rem",
            padding: "0.4rem 0.6rem",
            background: "var(--hud)",
            border: "1px solid var(--line)",
            borderRadius: "0.3rem",
            color: "var(--text)",
          }}
        />
        <button className="btn-ghost" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.8rem" }}>
          CREATE KEY
        </button>
      </form>
      {raw && (
        <code
          className="data"
          style={{
            userSelect: "all",
            background: "var(--hud)",
            padding: "0.5rem",
            borderRadius: "0.3rem",
            color: "var(--signal)",
            fontSize: "0.75rem",
          }}
        >
          {raw} ← copy now; it won&apos;t be shown again
        </code>
      )}
    </div>
  );
}
