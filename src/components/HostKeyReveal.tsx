"use client";
import { useState } from "react";
import { mintHostKey } from "@/app/admin/hosts/actions";

export function HostKeyReveal({ userId }: { userId: string }) {
  const [raw, setRaw] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <form
        action={async () => {
          const r = await mintHostKey(userId, label);
          setRaw(r);
        }}
        className="flex gap-2"
      >
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="label (e.g. Cole PC)"
          className="rounded bg-zinc-800 px-2 py-1 text-sm"
        />
        <button className="rounded bg-blue-500 px-3 py-1 text-sm font-medium text-black">Create key</button>
      </form>
      {raw && (
        <code className="select-all rounded bg-black/60 p-2 text-xs text-emerald-300">
          {raw} ← copy now; it won&apos;t be shown again
        </code>
      )}
    </div>
  );
}
