import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { setHost, revokeKey } from "./actions";
import { HostKeyReveal } from "@/components/HostKeyReveal";

export default async function AdminHostsPage() {
  if (!(await requireAdmin())) redirect("/");
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });

  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold">Hosts &amp; keys</h1>
      <ul className="mt-6 space-y-4">
        {users.map((u) => (
          <li key={u.id} className="rounded-xl border border-zinc-700 p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{u.username}</span>
              <form action={setHost.bind(null, u.id, !u.isHost)}>
                <button className="rounded bg-zinc-700 px-3 py-1 text-sm">
                  {u.isHost ? "Remove host" : "Make host"}
                </button>
              </form>
            </div>
            {u.isHost && (
              <div className="mt-3 space-y-2">
                {u.hostKeys.map((k) => (
                  <div key={k.id} className="flex items-center justify-between text-sm">
                    <code className="opacity-70">
                      {k.tokenPrefix}… {k.armedUntil ? "(armed)" : ""}
                    </code>
                    <form action={revokeKey.bind(null, k.id)}>
                      <button className="rounded bg-red-600/80 px-2 py-0.5 text-xs">Revoke</button>
                    </form>
                  </div>
                ))}
                <HostKeyReveal userId={u.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
