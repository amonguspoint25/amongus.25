import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { claimAdminAction, grantAdminAction, revokeAdminAction } from "./actions";

export const metadata = { title: "Admin — Among Us .25 Ranked" };

const panel = { padding: "1.5rem" } as const;
const ghost = { fontSize: "0.72rem", letterSpacing: "0.14em", padding: "0.55rem 0.9rem" } as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ granted?: string; nouser?: string; ambiguous?: string }>;
}) {
  const { granted, nouser, ambiguous } = await searchParams;
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;

  // Not signed in.
  if (!discordId) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="eyebrow mb-1">// CONTROL DECK</p>
        <h1 className="text-3xl font-extrabold mb-4">Admin</h1>
        <p className="data" style={{ color: "var(--muted)" }}>Sign in with Discord to access the admin panel.</p>
      </main>
    );
  }

  const me = await prisma.user.findUnique({ where: { discordId } });
  const adminCount = await prisma.user.count({ where: { isAdmin: true } });

  // Signed in but not an admin.
  if (!me?.isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="eyebrow mb-1">// CONTROL DECK</p>
        <h1 className="text-3xl font-extrabold mb-4">Admin</h1>
        <div className="hud-panel hud-corners" style={panel}>
          {adminCount === 0 ? (
            <>
              <p className="eyebrow mb-2">Bootstrap</p>
              <p className="data" style={{ color: "var(--muted)", margin: "0.5rem 0 1rem" }}>
                No admins exist yet. Claim admin to set up the site. This button disappears
                permanently once the first admin is set.
              </p>
              <form action={claimAdminAction}>
                <button className="btn-ghost" type="submit" style={ghost}>CLAIM ADMIN</button>
              </form>
            </>
          ) : (
            <p className="data" style={{ color: "var(--muted)" }}>Admins only. Ask an existing admin to grant you access.</p>
          )}
        </div>
      </main>
    );
  }

  // Admin view.
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: { id: true, username: true },
    orderBy: { username: "asc" },
  });

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// CONTROL DECK</p>
      <h1 className="text-3xl font-extrabold mb-2">Admin</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
        Signed in as {me.username}.
      </p>

      <div className="hud-panel hud-corners" style={{ ...panel, marginBottom: "1.5rem" }}>
        <p className="eyebrow mb-2">Tools</p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href="/admin/seasons" className="btn-ghost" style={ghost}>SEASONS</Link>
          <Link href="/admin/tournaments" className="btn-ghost" style={ghost}>TOURNAMENTS</Link>
        </div>
      </div>

      <div className="hud-panel hud-corners" style={panel}>
        <p className="eyebrow mb-2">Admins</p>
        <p className="data" style={{ color: "var(--muted)", margin: "0.5rem 0 1rem" }}>
          Grant admin by Discord username.
        </p>
        <form action={grantAdminAction} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            name="username"
            placeholder="Discord username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="data"
            style={{
              flex: "1 1 14rem", padding: "0.55rem 0.8rem",
              background: "var(--hud)", border: "1px solid var(--line)",
              borderRadius: "0.4rem", color: "var(--text)", letterSpacing: "0.04em",
            }}
          />
          <button className="btn-ghost" type="submit" style={ghost}>GRANT ADMIN</button>
        </form>
        {granted && (
          <p className="data" style={{ color: "var(--signal, #4dd0e0)", marginTop: "0.9rem" }}>✓ {granted} is now an admin.</p>
        )}
        {nouser && (
          <p className="data" style={{ color: "var(--warn, #e0a04d)", marginTop: "0.9rem" }}>No user named “{nouser}”. They must sign in once first.</p>
        )}
        {ambiguous && (
          <p className="data" style={{ color: "var(--warn, #e0a04d)", marginTop: "0.9rem" }}>More than one account is named “{ambiguous}”. Can’t safely grant by name — disambiguation by Discord ID isn’t built yet.</p>
        )}

        <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.5rem" }}>
          {admins.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between px-3 py-2"
              style={{ border: "1px solid var(--line)", color: "var(--text)" }}
            >
              <span className="data">{a.username}{a.id === me.id ? " (you)" : ""}</span>
              {admins.length > 1 && (
                <form action={revokeAdminAction}>
                  <input type="hidden" name="userId" value={a.id} />
                  <button
                    type="submit"
                    className="data"
                    style={{ fontSize: "0.7rem", letterSpacing: "0.1em", color: "var(--muted)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    REVOKE
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
