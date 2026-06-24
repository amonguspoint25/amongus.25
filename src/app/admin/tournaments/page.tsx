import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { CreateTournamentForm } from "@/components/CreateTournamentForm";

export default async function Page() {
  const admin = await requireAdmin();
  if (!admin) {
    return <main className="max-w-2xl mx-auto p-8"><p style={{ color: "var(--muted)" }}>Admins only. Sign in with an admin account.</p></main>;
  }
  const players = await prisma.player.findMany({ orderBy: { displayName: "asc" }, select: { id: true, displayName: true } });
  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// NEW BRACKET</p>
      <h1 className="text-3xl font-extrabold mb-6">Create tournament</h1>
      <CreateTournamentForm players={players} />
    </main>
  );
}
