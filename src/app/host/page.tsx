import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

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
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Host panel</h1>
        <p className="mt-2 text-sm opacity-70">
          You&apos;re an admin. To host ranked games, give your account the Host role in{" "}
          <a className="underline" href="/admin/hosts">Admin → Hosts</a> — that mints your host key.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Host panel</h1>
      <p className="mt-2 text-sm opacity-70">
        Download the ranked mod and run it while you host. It needs your host key to work, and
        ranked starts when you type <code className="rounded bg-black/50 px-1">/ranked</code> in the
        lobby — only the lobby host can start it.
      </p>

      <div className="mt-6 rounded-xl border border-zinc-600 p-6">
        <div className="text-lg font-semibold">Ranked mod</div>
        <p className="mt-1 text-sm opacity-70">
          Coming soon — the host mod isn&apos;t released yet. When it is, it&apos;ll download here
          (hosts only).
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-600 p-6">
        <div className="text-lg font-semibold">Your host key</div>
        {user.hostKeys.length > 0 ? (
          <>
            <p className="mt-1 text-sm opacity-70">
              Put this key in your mod&apos;s config. The full key was shown only once, when it was
              created.
            </p>
            <ul className="mt-3 space-y-1">
              {user.hostKeys.map((k) => (
                <li key={k.id} className="text-sm">
                  <code className="rounded bg-black/60 px-2 py-1 text-emerald-300">{k.tokenPrefix}…</code>
                  <span className="opacity-60"> · created {k.createdAt.toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs opacity-60">Lost the full key? Ask an admin to mint a new one.</p>
          </>
        ) : (
          <p className="mt-1 text-sm text-amber-400">
            You have no host key yet — ask an admin to create one for you.
          </p>
        )}
      </div>
    </main>
  );
}
