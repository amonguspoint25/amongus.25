"use client";
import Link from "next/link";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      className="max-w-2xl mx-auto p-8"
      style={{ minHeight: "60vh", display: "flex", flexDirection: "column", justifyContent: "center" }}
    >
      <p className="eyebrow mb-1">// SYSTEM FAULT</p>
      <h1 className="text-4xl font-extrabold mb-3">Something went sideways</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        An unexpected error occurred. Try again, or head back to base.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-ghost">Home</Link>
      </div>
    </main>
  );
}
