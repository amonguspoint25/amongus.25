import Link from "next/link";
import { prisma } from "@/lib/db";
import { TIERS, tierFor } from "@/lib/rank";
import { Reveal } from "@/components/Reveal";
import { HeroParallax } from "@/components/HeroParallax";
import { ActivityTicker } from "@/components/ActivityTicker";
import { CountUp } from "@/components/CountUp";
import type { ReactNode } from "react";

export default async function Home() {
  const [topPlayers, tournaments, playerCount, matchCount] = await Promise.all([
    prisma.player.findMany({ orderBy: { overallElo: "desc" }, take: 5 }),
    prisma.tournament.findMany({ orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.player.count(),
    prisma.match.count(),
  ]);

  return (
    <div className="relative z-10">
      {/* ───────────────────────── HERO (living-still parallax) ───────────────────────── */}
      <HeroParallax>
        <p className="eyebrow mb-4">// SECTOR .25 · RANKED UPLINK ESTABLISHED</p>
        <h1 className="font-display font-bold leading-[0.92]" style={{ fontSize: "clamp(2.75rem, 8vw, 6.5rem)" }}>
          AMONG&nbsp;US <span style={{ color: "var(--ion)", textShadow: "var(--glow)" }}>.25</span>
          <br />RANKED
        </h1>
        <p className="mt-5 text-base sm:text-lg mx-auto max-w-xl" style={{ color: "var(--muted)" }}>
          Two ladders, two roles. Crewmate diligence or impostor cunning — the ship
          logs every shot, kill, and task, and the rankings never lie.
        </p>
        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link href="/leaderboard" className="btn-primary">ACCESS RANKINGS →</Link>
          <Link href="#how" className="btn-ghost">HOW IT WORKS</Link>
        </div>
        <dl className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 data text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
          <Readout k="OPERATIVES" v={<CountUp value={playerCount} />} />
          <span style={{ color: "var(--line)" }}>//</span>
          <Readout k="MATCHES" v={<CountUp value={matchCount} />} />
          <span style={{ color: "var(--line)" }}>//</span>
          <Readout k="LADDERS" v="CREW · IMP" />
        </dl>
      </HeroParallax>

      <ActivityTicker />

      {/* ─────────────────────── LIVE RANKINGS ─────────────────────── */}
      <section id="rankings" className="section-pad px-6 cv-section">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <SectionHead eyebrow="// LIVE RANKINGS" title="The ladder never lies" />
          </Reveal>
          <div className="mt-10 grid gap-3">
            {topPlayers.map((p, i) => (
              <Reveal key={p.id} delay={i * 70}>
                <Link href={`/players/${p.id}`} className="hud-panel flex items-center gap-4 px-5 py-4 hover:brightness-125 transition-[filter]">
                  <span className="glow-num text-lg w-8" style={{ color: i === 0 ? "var(--signal)" : "var(--muted)" }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={tierFor(p.overallElo).image} alt="" width={34} height={34} />
                  <span className="font-display font-semibold flex-1">{p.displayName}</span>
                  <span className="eyebrow hidden sm:inline" style={{ color: tierFor(p.overallElo).name === "Top Impostor" ? "var(--alert)" : "var(--muted)" }}>
                    {tierFor(p.overallElo).name}
                  </span>
                  <span className="glow-num text-xl" style={{ color: "var(--ion)" }}>{Math.round(p.overallElo)}</span>
                </Link>
              </Reveal>
            ))}
            {topPlayers.length === 0 && (
              <p className="data" style={{ color: "var(--muted)" }}>No operatives ranked yet.</p>
            )}
          </div>
          <Reveal>
            <div className="mt-8">
              <Link href="/leaderboard" className="btn-ghost inline-block">VIEW FULL MANIFEST →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────── HOW RANKING WORKS ─────────────────────── */}
      <section id="how" className="section-pad px-6 cv-section" style={{ background: "linear-gradient(var(--void), #070b14, var(--void))" }}>
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <SectionHead eyebrow="// RANKING PROTOCOL" title="Two roles. Two ratings." />
          </Reveal>
          <div className="mt-10 grid md:grid-cols-2 gap-4">
            <Reveal>
              <div className="hud-panel hud-corners p-6 h-full">
                <p className="eyebrow">CREW RATING</p>
                <p className="mt-2" style={{ color: "var(--muted)" }}>
                  Earned by finishing tasks fast, voting out impostors with correct shots, and surviving.
                  Wasting votes on innocent crew costs you.
                </p>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="hud-panel hud-corners p-6 h-full">
                <p className="eyebrow" style={{ color: "var(--alert)" }}>IMPOSTOR RATING</p>
                <p className="mt-2" style={{ color: "var(--muted)" }}>
                  Earned by killing efficiently, staying off the suspect list, and closing out the round.
                  Get ejected and it stings.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal>
            <div className="hud-panel mt-4 p-6">
              <p className="eyebrow mb-3">// RATING FORMULA</p>
              <p className="data text-sm sm:text-base" style={{ color: "var(--text)" }}>
                Δ = <span style={{ color: "var(--signal)" }}>K</span>·(result − expected) + <span style={{ color: "var(--signal)" }}>B</span>·perf
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                A true-ELO core (win probability vs. the other side) nudged by how well you actually played.
                K=32, base rating 1000.
              </p>
            </div>
          </Reveal>

          <Reveal>
            <p className="eyebrow mt-12 mb-4">// RANK TIERS</p>
          </Reveal>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {TIERS.map((t, i) => (
              <Reveal key={t.name} delay={i * 60}>
                <div className="hud-panel p-3 flex flex-col items-center text-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.image} alt="" width={48} height={48} />
                  <span className="eyebrow" style={{ color: t.name === "Top Impostor" ? "var(--alert)" : "var(--signal)" }}>{t.name}</span>
                  <span className="glow-num text-xs" style={{ color: "var(--muted)" }}>{t.min}+</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────── TOURNAMENTS ─────────────────────── */}
      <section id="tournaments" className="section-pad px-6 cv-section">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <SectionHead eyebrow="// BRACKET CONTROL" title="Prove it in a bracket" />
          </Reveal>
          <div className="mt-10 grid gap-3">
            {tournaments.map((t, i) => (
              <Reveal key={t.id} delay={i * 70}>
                <Link href={`/tournaments/${t.slug}`} className="hud-panel flex items-center justify-between px-5 py-4 hover:brightness-125 transition-[filter]">
                  <span className="font-display font-semibold">{t.name}</span>
                  <span className="eyebrow" style={{ color: t.status === "COMPLETE" ? "var(--muted)" : "var(--signal)" }}>{t.status}</span>
                </Link>
              </Reveal>
            ))}
            {tournaments.length === 0 && (
              <Reveal>
                <p className="data" style={{ color: "var(--muted)" }}>No brackets running. Check back soon.</p>
              </Reveal>
            )}
          </div>
          <Reveal>
            <div className="mt-8">
              <Link href="/tournaments" className="btn-ghost inline-block">ALL TOURNAMENTS →</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────── JOIN ─────────────────────── */}
      <section id="join" className="section-pad px-6 cv-section">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <p className="eyebrow">// SECURE UPLINK</p>
            <h2 className="font-display font-bold mt-3" style={{ fontSize: "clamp(2rem, 5vw, 3.5rem)" }}>
              Link up. Start climbing.
            </h2>
            <p className="mt-4" style={{ color: "var(--muted)" }}>
              Sign in with Discord, grab your one-time link code, redeem it in-game on the
              .25 server, and every match starts counting toward your rank.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link href="/link" className="btn-primary">GET MY LINK CODE →</Link>
              <Link href="/leaderboard" className="btn-ghost">SEE THE LADDER</Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="font-display font-bold mt-2" style={{ fontSize: "clamp(1.8rem, 4.5vw, 3rem)" }}>{title}</h2>
    </div>
  );
}

function Readout({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow" style={{ letterSpacing: "0.18em" }}>{k}</span>
      <span className="glow-num" style={{ color: "var(--signal)" }}>{v}</span>
    </div>
  );
}
