"use client";
import { useState } from "react";

type Props = {
  value: string;
};

export function CopyButton({ value }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <button
      className="btn-ghost"
      onClick={handleCopy}
      style={{
        fontSize: "0.72rem",
        letterSpacing: "0.14em",
        padding: "0.4rem 0.9rem",
        color: copied ? "var(--ok)" : undefined,
        borderColor: copied ? "var(--ok)" : undefined,
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      {copied ? "COPIED ✓" : "COPY CODE"}
    </button>
  );
}
