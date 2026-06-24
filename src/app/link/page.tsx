import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";

export const metadata = { title: "Link account — Among Us .25 Ranked" };

export default async function LinkPage() {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
        <p style={{ color: "var(--muted)" }}>Sign in with Discord to get your link code.</p>
      </main>
    );
  }
  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
      <div className="rounded-xl p-6" style={{ background: "var(--surface)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>Your one-time link code</p>
        <p className="text-3xl font-mono tracking-widest my-2" style={{ color: "var(--primary)" }}>
          {player?.linkCode ?? "—"}
        </p>
        <p style={{ color: "var(--muted)" }}>
          {player?.isLinked
            ? "✓ Linked — your in-game matches now count toward your rank."
            : "Redeem this code on the .25 server in-game to start tracking your stats."}
        </p>
      </div>
      <Link href="/leaderboard" className="inline-block mt-6" style={{ color: "var(--primary)" }}>← Leaderboard</Link>
    </main>
  );
}
