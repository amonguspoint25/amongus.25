import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { RolloverSeasonButton } from "@/components/RolloverSeasonButton";

export const metadata = { title: "Seasons — Among Us .25 Ranked" };

export default async function Page() {
  const admin = await requireAdmin();
  if (!admin) {
    return <main className="max-w-2xl mx-auto p-8"><p style={{ color: "var(--muted)" }}>Admins only. Sign in with an admin account.</p></main>;
  }

  const active = await prisma.season.findFirst({ where: { endedAt: null }, orderBy: { number: "desc" } });
  const games = active ? await prisma.match.count({ where: { seasonId: active.id } }) : 0;

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// SEASON CONTROL</p>
      <h1 className="text-3xl font-extrabold mb-6">Seasons</h1>
      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        {active ? (
          <>
            <p className="eyebrow mb-2">Active</p>
            <p className="data" style={{ margin: "0.25rem 0 1rem" }}>
              Season {active.number} · started {active.startedAt.toLocaleDateString()} · {games} games
            </p>
            <RolloverSeasonButton label={`END SEASON ${active.number} & START ${active.number + 1}`} />
          </>
        ) : (
          <>
            <p className="data" style={{ color: "var(--muted)", margin: "0.25rem 0 1rem" }}>No season has started yet.</p>
            <RolloverSeasonButton label="START SEASON 1" />
          </>
        )}
      </div>
    </main>
  );
}
