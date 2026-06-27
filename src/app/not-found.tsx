import Link from "next/link";

export default function NotFound() {
  return (
    <main
      className="max-w-2xl mx-auto p-8"
      style={{ minHeight: "60vh", display: "flex", flexDirection: "column", justifyContent: "center" }}
    >
      <p className="eyebrow mb-1">// SIGNAL LOST · 404</p>
      <h1 className="text-4xl font-extrabold mb-3">Off the manifest</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        That page isn’t on the station. It may have been ejected.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <Link href="/" className="btn-primary">← Home</Link>
        <Link href="/leaderboard" className="btn-ghost">Leaderboard</Link>
      </div>
    </main>
  );
}
