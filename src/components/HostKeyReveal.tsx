"use client";
import { useState } from "react";
import { mintHostKey } from "@/app/admin/hosts/actions";

export function HostKeyReveal({ userId }: { userId: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState(false);

  async function copyKey() {
    if (!raw) return;
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked — the read-only field below selects on focus as a fallback.
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <form
        action={async () => {
          const r = await mintHostKey(userId, label);
          setRaw(r);
          setCopied(false);
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
        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {/* The field holds ONLY the key, so the Copy button (and select-on-focus) can never
                pick up surrounding text — that was the bug that produced 401s. */}
            <input
              readOnly
              value={raw}
              onFocus={(e) => e.currentTarget.select()}
              className="data"
              style={{
                flex: "1 1 18rem",
                userSelect: "all",
                fontFamily: "monospace",
                background: "var(--hud)",
                border: "1px solid var(--line)",
                padding: "0.5rem",
                borderRadius: "0.3rem",
                color: "var(--signal)",
                fontSize: "0.75rem",
              }}
            />
            <button
              type="button"
              onClick={copyKey}
              className="btn-ghost"
              style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.8rem" }}
            >
              {copied ? "COPIED ✓" : "COPY"}
            </button>
          </div>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
            Copy this now — it won&apos;t be shown again. Paste it into the mod&apos;s &ldquo;Set Host Key&rdquo; helper.
          </span>
        </div>
      )}
    </div>
  );
}
