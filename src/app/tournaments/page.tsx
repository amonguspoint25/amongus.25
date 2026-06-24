import { prisma } from "@/lib/db";
import Link from "next/link";

export const metadata = { title: "Tournaments — Among Us .25 Ranked" };

export default async function Page() {
  const ts = await prisma.tournament.findMany({ orderBy: { createdAt: "desc" } });
  return (
    <main className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-extrabold">Tournaments</h1>
        <Link href="/admin/tournaments" className="text-sm" style={{ color: "var(--primary)" }}>+ Admin</Link>
      </div>
      {ts.length === 0 && <p style={{ color: "var(--muted)" }}>No tournaments yet.</p>}
      <ul className="space-y-3">
        {ts.map((t) => (
          <li key={t.id}>
            <Link href={`/tournaments/${t.slug}`} className="block rounded-xl p-4" style={{ background: "var(--surface)" }}>
              <span className="font-semibold">{t.name}</span>
              <span className="ml-3 text-sm" style={{ color: "var(--muted)" }}>{t.status}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
