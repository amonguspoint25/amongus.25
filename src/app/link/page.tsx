import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { isExpired } from "@/lib/linkcode";
import { generateLinkCode } from "./actions";

export const metadata = { title: "Link account — Among Us .25 Ranked" };

export default async function LinkPage({
  searchParams,
}: {
  searchParams: Promise<{ slow?: string }>;
}) {
  const { slow } = await searchParams;
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
  const now = new Date();
  const hasActiveCode = !!player?.linkCode && !isExpired(player.linkCodeExpiresAt, now);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// SECURE UPLINK</p>
      <h1 className="text-3xl font-extrabold mb-4">Link your account</h1>
      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        {hasActiveCode ? (
          <>
            <p className="eyebrow mb-2">Your link code (one-time, expires soon)</p>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", margin: "0.5rem 0 1rem" }}>
              <p
                className="glow-num"
                style={{ fontSize: "2rem", letterSpacing: "0.35em", color: "var(--signal)", textShadow: "var(--glow-cyan)", margin: 0 }}
              >
                {player!.linkCode}
              </p>
              <CopyButton value={player!.linkCode!} />
            </div>
            <p className="data" style={{ color: "var(--muted)" }}>
              Expires at {player!.linkCodeExpiresAt!.toLocaleTimeString()}. Redeem it on the .25 server in-game.
            </p>
            <form action={generateLinkCode} style={{ marginTop: "1rem" }}>
              <button className="btn-ghost" type="submit" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.9rem" }}>
                REGENERATE
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="eyebrow mb-2">Link code</p>
            <p className="data" style={{ color: "var(--muted)", margin: "0.5rem 0 1rem" }}>
              {isLinked
                ? "✓ Linked. Generate a new code only if you need to re-link."
                : "Generate a one-time code, then redeem it on the .25 server in-game."}
            </p>
            <form action={generateLinkCode}>
              <button className="btn-ghost" type="submit" style={{ fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.4rem 0.9rem" }}>
                GENERATE LINK CODE
              </button>
            </form>
          </>
        )}
        {slow && (
          <p className="data" style={{ color: "var(--warn, #e0a04d)", marginTop: "1rem" }}>
            Slow down — wait a moment before generating another code.
          </p>
        )}
      </div>
      <Link href="/leaderboard" className="eyebrow inline-block mt-6" style={{ color: "var(--muted)" }}>← Leaderboard</Link>
    </main>
  );
}
