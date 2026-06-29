import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

const panel = { padding: "1.5rem", marginTop: "1.5rem" } as const;
const code = { background: "var(--hud)", padding: "0.15rem 0.45rem", borderRadius: "0.3rem" } as const;

export default async function HostPage() {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/");
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!user?.isHost && !user?.isAdmin) redirect("/");

  // An admin who isn't a host has no host key. Point them to grant themselves the role.
  if (!user.isHost && user.isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="eyebrow mb-1">// HOST</p>
        <h1 className="text-3xl font-extrabold mb-4">Host panel</h1>
        <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
          <p className="data" style={{ color: "var(--muted)" }}>
            You&apos;re an admin. To host ranked games, give your account the Host role in{" "}
            <Link href="/admin/hosts" style={{ color: "var(--signal)" }}>Admin → Hosts</Link> — that
            mints your host key.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// HOST</p>
      <h1 className="text-3xl font-extrabold mb-2">Host panel</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "0.5rem" }}>
        Run the ranked mod while you host. It needs your host key, and ranked starts when you type{" "}
        <code style={code}>/ranked</code> in the lobby — only the lobby host can start it.
      </p>

      <div className="hud-panel hud-corners" style={panel}>
        <p className="eyebrow mb-2">Ranked mod · v0.2.0</p>
        <p className="data" style={{ color: "var(--muted)", marginBottom: "0.9rem" }}>
          Host-only. Extract into your Among Us folder, launch once, paste your host key, then type{" "}
          <code style={code}>/ranked on</code> in a lobby you host.
        </p>
        <a
          href="/downloads/GameWatcherRanked.zip"
          download
          style={{
            display: "inline-block",
            background: "var(--signal)",
            color: "#070707",
            padding: "0.6rem 1.25rem",
            borderRadius: "0.4rem",
            fontWeight: 800,
            letterSpacing: "0.02em",
            textDecoration: "none",
          }}
        >
          ↓ Download mod (.zip · 32 MB)
        </a>
        <ol
          style={{
            color: "var(--muted)",
            fontSize: "0.82rem",
            margin: "1rem 0 0",
            paddingLeft: "1.2rem",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          <li>
            Close Among Us, then extract the zip into the folder containing{" "}
            <code style={code}>Among Us.exe</code>.
          </li>
          <li>Launch once and wait ~30s at the menu — the first launch builds interface files (one-time).</li>
          <li>
            Run <code style={code}>Set Host Key.bat</code> and paste your key (shown below).
          </li>
          <li>
            Host a lobby → <code style={code}>/ranked on</code>.
          </li>
        </ol>
        <p className="data" style={{ color: "var(--muted)", fontSize: "0.74rem", marginTop: "0.85rem" }}>
          Only the lobby host needs the mod. Requires the ranked Among Us build everyone plays on.
        </p>
        <div style={{ marginTop: "1rem", paddingTop: "0.85rem", borderTop: "1px solid var(--line)" }}>
          <p className="eyebrow mb-2">What&apos;s new · v0.2.0</p>
          <ul style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.3rem" }}>
            <li>Fixed: crew wins were recorded as impostor wins — ELO is now correct.</li>
            <li>Match uploads retry automatically and survive a restart.</li>
            <li>Anonymous Votes must be ON (powers the ghost vote reveal).</li>
            <li>Clearer in-lobby message when a setting blocks ranked start.</li>
            <li>Website: harder ELO ladder + new tiers (Wood, Iron, Mastermind).</li>
          </ul>
        </div>
      </div>

      <div className="hud-panel hud-corners" style={panel}>
        <p className="eyebrow mb-2">Required lobby settings</p>
        <p className="data" style={{ color: "var(--muted)", marginBottom: "0.7rem", fontSize: "0.82rem" }}>
          Ranked won&apos;t start until the lobby matches this preset — the mod chats which one to fix.
        </p>
        <ul style={{ color: "var(--muted)", fontSize: "0.8rem", margin: 0, paddingLeft: "1.2rem", display: "grid", gap: "0.3rem" }}>
          <li>Map <strong>Polus</strong> · <strong>2</strong> impostors · Classic mode</li>
          <li>All roles <strong>OFF</strong></li>
          <li>Player speed <strong>1.25</strong> · Crew vision <strong>0.25</strong> · Impostor vision <strong>1.75</strong></li>
          <li>Kill cooldown <strong>22.5</strong> · Kill distance <strong>Short</strong></li>
          <li>Emergency meetings <strong>1</strong> · cooldown <strong>20</strong> · discussion <strong>0</strong> · voting <strong>150</strong></li>
          <li>Tasks <strong>2 / 3 / 5</strong> (common/long/short) · Visual tasks <strong>OFF</strong> · Task bar <strong>Never</strong></li>
          <li>Anonymous Votes <strong>ON</strong> · Confirm Ejects <strong>OFF</strong></li>
          <li><strong>10</strong> linked players minimum</li>
        </ul>
      </div>

      <div className="hud-panel hud-corners" style={panel}>
        <p className="eyebrow mb-2">Your host key</p>
        {user.hostKeys.length > 0 ? (
          <>
            <p className="data" style={{ color: "var(--muted)", margin: "0.25rem 0 0.75rem" }}>
              Put this key in your mod&apos;s config. The full key was shown only once, when it was
              created.
            </p>
            <div style={{ display: "grid", gap: "0.4rem" }}>
              {user.hostKeys.map((k) => (
                <div key={k.id} className="data">
                  <code style={{ ...code, color: "var(--signal)" }}>{k.tokenPrefix}…</code>
                  <span style={{ color: "var(--muted)" }}> · created {k.createdAt.toLocaleDateString()}</span>
                </div>
              ))}
            </div>
            <p className="data" style={{ color: "var(--muted)", fontSize: "0.78rem", marginTop: "0.75rem" }}>
              Lost the full key? Ask an admin to mint a new one.
            </p>
          </>
        ) : (
          <p className="data" style={{ color: "var(--warn, #e0a04d)" }}>
            You have no host key yet — ask an admin to create one for you.
          </p>
        )}
      </div>
    </main>
  );
}
