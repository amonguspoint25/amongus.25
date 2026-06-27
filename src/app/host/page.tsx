import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isArmed } from "@/lib/hostkey";
import { armRanked, disarmRanked } from "./actions";

export default async function HostPage() {
  const session = await auth();
  const discordId = (session?.user as { id?: string } | undefined)?.id;
  if (!discordId) redirect("/");
  const user = await prisma.user.findUnique({
    where: { discordId },
    include: { hostKeys: { where: { revokedAt: null }, orderBy: { createdAt: "asc" } } },
  });
  if (!user?.isHost && !user?.isAdmin) redirect("/");

  // An admin who isn't a host can reach this panel but has no host key to arm. Point
  // them to flag themselves as a host (which mints a key) rather than show a dead button.
  if (!user.isHost && user.isAdmin) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">Ranked host panel</h1>
        <p className="mt-2 text-sm opacity-70">
          You&apos;re an admin. To host ranked games yourself, give your account the Host
          role in <a className="underline" href="/admin/hosts">Admin → Hosts</a> — that mints
          your host key. Then this panel lets you arm ranked.
        </p>
      </main>
    );
  }

  const now = new Date();
  const armedUntil =
    user.hostKeys
      .map((k) => k.armedUntil)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const armed = isArmed(armedUntil, now);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Ranked host panel</h1>
      <p className="mt-2 text-sm opacity-70">
        Arm ranked before you start hosting. Your mod records games while this is on.
      </p>

      <div className={`mt-6 rounded-xl border p-6 ${armed ? "border-emerald-400" : "border-zinc-600"}`}>
        <div className="text-lg font-semibold">RANKED: {armed ? "ON" : "OFF"}</div>
        {armed && armedUntil && (
          <div className="text-sm opacity-70">auto-off at {armedUntil.toLocaleTimeString()}</div>
        )}
        <div className="mt-4 flex gap-3">
          <form action={armRanked}>
            <button className="rounded-lg bg-emerald-500 px-4 py-2 font-medium text-black" disabled={armed}>
              Start ranked
            </button>
          </form>
          <form action={disarmRanked}>
            <button className="rounded-lg bg-zinc-700 px-4 py-2 font-medium" disabled={!armed}>
              Stop ranked
            </button>
          </form>
        </div>
      </div>

      {user.hostKeys.length === 0 && (
        <p className="mt-4 text-sm text-amber-400">
          You have no host key yet — ask an admin to create one for you.
        </p>
      )}
    </main>
  );
}
