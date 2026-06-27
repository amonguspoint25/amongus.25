import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { setHost, revokeKey } from "./actions";
import { HostKeyReveal } from "@/components/HostKeyReveal";

const ghost = { fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.45rem 0.8rem" } as const;
const codeStyle = { background: "var(--hud)", padding: "0.2rem 0.5rem", borderRadius: "0.3rem", color: "var(--muted)" } as const;

export default async function AdminHostsPage() {
  if (!(await requireAdmin())) redirect("/");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });

  return (
    <main className="max-w-3xl mx-auto p-8">
      <p className="eyebrow mb-1">// HOST KEYS</p>
      <h1 className="text-3xl font-extrabold mb-6">Hosts &amp; keys</h1>
      <div style={{ display: "grid", gap: "1rem" }}>
        {users.map((u) => (
          <div key={u.id} className="hud-panel hud-corners" style={{ padding: "1.25rem" }}>
            <div className="flex items-center justify-between">
              <span className="data" style={{ color: "var(--text)" }}>{u.username}</span>
              <form action={setHost.bind(null, u.id, !u.isHost)}>
                <button className="btn-ghost" style={ghost}>{u.isHost ? "REMOVE HOST" : "MAKE HOST"}</button>
              </form>
            </div>
            {u.isHost && (
              <div style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
                {u.hostKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between">
                    <code className="data" style={codeStyle}>{k.tokenPrefix}…</code>
                    <form action={revokeKey.bind(null, k.id)}>
                      <button className="btn-ghost" style={{ ...ghost, color: "var(--alert, #e0524d)", borderColor: "var(--alert, #e0524d)" }}>REVOKE</button>
                    </form>
                  </div>
                ))}
                <HostKeyReveal userId={u.id} />
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
