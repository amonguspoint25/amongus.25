import Link from "next/link";
import { getSessionUser } from "@/lib/sessionUser";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const metadata = { title: "Account — Among Us .25 Ranked" };

export default async function AccountPage() {
  const me = await getSessionUser();

  if (!me) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <p className="eyebrow mb-1">// OPERATIVE</p>
        <h1 className="text-3xl font-extrabold mb-4">Account</h1>
        <p className="data" style={{ color: "var(--muted)" }}>Sign in with Discord to manage your account.</p>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// OPERATIVE</p>
      <h1 className="text-3xl font-extrabold mb-2">Account</h1>
      <p className="data" style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>Signed in as {me.username}.</p>

      <div className="hud-panel hud-corners" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <p className="eyebrow mb-2">Your data</p>
        <p className="data" style={{ color: "var(--muted)" }}>
          Manage your Among Us friend code on the{" "}
          <Link href="/link" style={{ color: "var(--signal)" }}>Link</Link> page. See exactly what we
          store and why in the{" "}
          <Link href="/privacy" style={{ color: "var(--signal)" }}>Privacy</Link> policy.
        </p>
      </div>

      <div className="hud-panel hud-corners" style={{ padding: "1.5rem" }}>
        <p className="eyebrow mb-2" style={{ color: "var(--alert, #e0524d)" }}>Danger zone</p>
        <p className="data" style={{ color: "var(--muted)", margin: "0.5rem 0 1rem" }}>
          Permanently delete your account and everything tied to it — profile, stats, friend code,
          account id, link, and any host keys. This can’t be undone.
        </p>
        <DeleteAccountButton />
      </div>
    </main>
  );
}
