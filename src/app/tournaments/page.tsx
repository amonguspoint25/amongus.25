import { prisma } from "@/lib/db";
import Link from "next/link";

export const metadata = { title: "Tournaments — Among Us .25 Ranked" };
// Queries the DB on render, so it must not be prerendered at build.
export const dynamic = "force-dynamic";

const BTN_CLIP = "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)";

export default async function Page() {
  const ts = await prisma.tournament.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main className="max-w-4xl mx-auto p-8">
      <p className="eyebrow mb-1">// BRACKET CONTROL</p>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-extrabold">Tournaments</h1>
        <Link
          href="/admin/tournaments"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "0.8rem",
            letterSpacing: "0.08em",
            clipPath: BTN_CLIP,
            padding: "8px 18px",
            border: "1px solid var(--line)",
            color: "var(--muted)",
            transition: "color 0.15s",
            display: "inline-block",
          }}
          onMouseEnter={undefined}
        >
          + Admin
        </Link>
      </div>
      {ts.length === 0 && <p className="data" style={{ color: "var(--muted)" }}>No tournaments yet.</p>}
      <ul className="space-y-3">
        {ts.map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.slug}`} className="hud-panel block" style={{ padding: "1rem 1.25rem" }}>
              <span className="font-semibold" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{t.name}</span>
              <span className="data ml-3 text-sm" style={{ color: "var(--signal)" }}>{t.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
