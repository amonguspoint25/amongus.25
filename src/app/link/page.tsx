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
        <p className="eyebrow mb-1">// SECURE UPLINK</p>
        <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
        <p className="data" style={{ color: "var(--muted)" }}>Sign in with Discord to get your link code.</p>
      </main>
    );
  }
  const player = await prisma.player.findFirst({ where: { user: { discordId } } });
  const isLinked = player?.isLinked ?? false;
  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// SECURE UPLINK</p>
      <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        <p className="eyebrow mb-2">Your one-time link code</p>
        <p
          className="glow-num"
          style={{
            fontSize: "2rem",
            letterSpacing: "0.35em",
            color: "var(--signal)",
            textShadow: "var(--glow-cyan)",
            margin: "0.5rem 0 1rem",
          }}
        >
          {player?.linkCode ?? "—"}
        </p>
        <p className="data" style={{ color: isLinked ? "var(--signal)" : "var(--muted)" }}>
          {isLinked
            ? "✓ Linked — your in-game matches now count toward your rank."
            : "Redeem this code on the .25 server in-game to start tracking your stats."}
        </p>
      </div>
      <Link href="/leaderboard" className="eyebrow inline-block mt-6" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
    </main>
  );
}
