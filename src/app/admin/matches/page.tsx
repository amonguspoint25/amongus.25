import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { toggleMatchVoidedAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/");

  const matches = await prisma.match.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { _count: { select: { participants: true } } },
  });

  return (
    <main className="max-w-3xl mx-auto p-8">
      <p className="eyebrow mb-1">// ADMIN</p>
      <h1 className="text-3xl font-extrabold mb-2">Matches</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1rem" }}>
        Void a match to remove it from ranked — every affected player&apos;s ELO is recomputed
        from match history automatically. Un-void restores it.
      </p>

      <div className="hud-panel hud-corners" style={{ overflow: "hidden" }}>
        {matches.length === 0 && (
          <p className="data p-4" style={{ color: "var(--muted)" }}>No matches yet.</p>
        )}
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-3 p-3 border-t"
            style={{ borderColor: "var(--line)" }}
          >
            <span className="data" style={{ minWidth: 0 }}>
              <Link
                href={`/matches/${m.id}`}
                style={{
                  color: m.voided ? "var(--muted)" : "var(--text)",
                  textDecoration: m.voided ? "line-through" : "none",
                }}
              >
                {m.outcome === "IMP_WIN" ? "Impostors win" : "Crew win"}
              </Link>
              <span style={{ color: "var(--muted)" }}>
                {" · "}{m.map ?? "—"}{" · "}{m._count.participants}p{" · "}{m.startedAt.toLocaleDateString()}
              </span>
              {m.voided && <span style={{ color: "var(--alert)", fontWeight: 700 }}>{" · VOIDED"}</span>}
            </span>
            <form action={toggleMatchVoidedAction}>
              <input type="hidden" name="matchId" value={m.id} />
              <input type="hidden" name="voided" value={m.voided ? "false" : "true"} />
              <button
                type="submit"
                className="data"
                style={{
                  background: m.voided ? "var(--hud)" : "var(--alert)",
                  color: m.voided ? "var(--text)" : "#070707",
                  border: "none",
                  padding: "0.35rem 0.8rem",
                  borderRadius: "0.3rem",
                  cursor: "pointer",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {m.voided ? "Un-void" : "Void"}
              </button>
            </form>
          </div>
        ))}
      </div>

      <Link href="/admin" className="eyebrow" style={{ color: "var(--muted)", display: "inline-block", marginTop: "1rem" }}>
        ← Admin
      </Link>
    </main>
  );
}
