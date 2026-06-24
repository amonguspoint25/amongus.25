import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { BracketView } from "@/components/BracketView";
import { AdminReportControls } from "@/components/AdminReportControls";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await prisma.tournament.findUnique({ where: { slug }, include: { bracket: true } });
  if (!t) {
    return <main className="max-w-4xl mx-auto p-8"><p style={{ color: "var(--muted)" }}>Tournament not found.</p></main>;
  }
  const ids = [...new Set(t.bracket.flatMap((b) => [b.playerAId, b.playerBId]).filter(Boolean) as string[])];
  const players = ids.length ? await prisma.player.findMany({ where: { id: { in: ids } } }) : [];
  const names = Object.fromEntries(players.map((p) => [p.id, p.displayName]));
  const isAdmin = !!(await requireAdmin());
  const bracket = t.bracket.map((b) => ({
    id: b.id, round: b.round, slotInRound: b.slotInRound,
    playerAId: b.playerAId, playerBId: b.playerBId, winnerId: b.winnerId,
  }));
  return (
    <main className="max-w-5xl mx-auto p-8">
      <h1 className="text-3xl font-extrabold mb-1">{t.name}</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>{t.status} · single elimination</p>
      <img src={t.bannerUrl ?? "/media/banner-tournament.png"} alt="" className="rounded-xl mb-6 w-full object-cover max-h-56" />
      <BracketView matches={bracket} names={names} />
      {isAdmin && <AdminReportControls tournamentId={t.id} matches={bracket} names={names} />}
    </main>
  );
}
