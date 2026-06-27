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
        <p className="eyebrow mb-2">Ranked mod</p>
        <p className="data" style={{ color: "var(--muted)" }}>
          Coming soon — the host mod isn&apos;t released yet. When it is, it&apos;ll download here
          (hosts only).
        </p>
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
