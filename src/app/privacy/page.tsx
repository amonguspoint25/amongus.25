import Link from "next/link";

export const metadata = { title: "Privacy — Among Us .25 Ranked" };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto p-8">
      <p className="eyebrow mb-1">// DATA POLICY</p>
      <h1 className="text-3xl font-extrabold mb-6">Privacy</h1>

      <div className="hud-panel hud-corners" style={{ padding: "1.5rem", lineHeight: 1.75 }}>
        <p className="data" style={{ color: "var(--muted)", marginBottom: "1.25rem" }}>
          This is a community ranked leaderboard for the Among Us “.25” server. Here is exactly
          what we store and why — no more than is needed to run the ladder.
        </p>

        <Section title="What we collect">
          <ul style={{ listStyle: "disc", paddingLeft: "1.25rem" }}>
            <li>Your Discord account id, username, and avatar — from signing in with Discord.</li>
            <li>Your Among Us friend code and account id (PUID) — only if you choose to link, so
              your in-game games can be attributed to you.</li>
            <li>Your match results and ELO/stats from ranked games played on the server.</li>
          </ul>
        </Section>

        <Section title="How we use it">
          Only to run the ranked system: show leaderboards and profiles, compute ELO, and attribute
          your games. We don’t sell it, run ads, or share it with third parties.
        </Section>

        <Section title="Who can see what">
          Your display name, ELO, and stats are public on the leaderboard and your profile. Your
          Discord id, friend code, and PUID are <strong>never shown publicly</strong> and never sent
          off our server — the ranked mod only ever receives an opaque internal id.
        </Section>

        <Section title="Where it’s stored">
          In a Postgres database (Neon). Access is limited to the site’s admins.
        </Section>

        <Section title="Deleting your data">
          You can permanently delete your account and everything tied to it at any time from your{" "}
          <Link href="/account" style={{ color: "var(--signal)" }}>Account</Link> page. This removes
          your profile, stats, friend code, account id, and host keys. It can’t be undone.
        </Section>

        <Section title="Contact">
          Questions? Reach an admin on the .25 Discord server.
        </Section>
      </div>

      <Link href="/" className="eyebrow inline-block mt-6" style={{ color: "var(--muted)" }}>← Home</Link>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p className="eyebrow mb-2">{title}</p>
      <div className="data" style={{ color: "var(--text)" }}>{children}</div>
    </div>
  );
}
