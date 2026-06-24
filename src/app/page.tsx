import Link from "next/link";

export default function Home() {
  return (
    <main
      className="relative z-10 flex flex-col items-center justify-center text-center overflow-hidden px-6"
      style={{ minHeight: "calc(100vh - 3.5rem)" }}
    >
      <video
        autoPlay
        muted
        loop
        playsInline
        poster="/media/hero.png"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.5 }}
      >
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>

      {/* viewport vignette so the HUD reads over the footage */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 85% at 50% 28%, transparent 38%, rgba(5,7,13,0.72) 76%, var(--void)), linear-gradient(transparent 50%, var(--void))",
        }}
      />

      {/* targeting-frame around the viewport */}
      <div
        className="absolute inset-4 sm:inset-8 pointer-events-none hud-corners"
        style={{ border: "1px solid var(--line)" }}
        aria-hidden
      />

      <div className="relative z-10 max-w-3xl">
        <p className="eyebrow mb-4">// SECTOR .25 · RANKED UPLINK ESTABLISHED</p>

        <h1
          className="font-display font-bold leading-[0.92]"
          style={{ fontSize: "clamp(2.75rem, 8vw, 6.5rem)" }}
        >
          AMONG&nbsp;US{" "}
          <span style={{ color: "var(--ion)", textShadow: "var(--glow)" }}>.25</span>
          <br />
          RANKED
        </h1>

        <p className="mt-5 text-base sm:text-lg mx-auto max-w-xl" style={{ color: "var(--muted)" }}>
          Two ladders, two roles. Crewmate diligence or impostor cunning — the ship
          logs every shot, kill, and task, and the rankings never lie.
        </p>

        <div className="mt-8 flex flex-wrap gap-3 justify-center">
          <Link
            href="/leaderboard"
            className="px-6 py-3 font-display font-semibold tracking-wide transition-shadow"
            style={{
              background: "var(--ion)",
              color: "#04060b",
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
              boxShadow: "var(--glow)",
            }}
          >
            ACCESS RANKINGS →
          </Link>
          <Link
            href="/link"
            className="px-6 py-3 font-display font-semibold tracking-wide transition-colors hover:text-[var(--signal)]"
            style={{
              color: "var(--text)",
              border: "1px solid var(--line)",
              clipPath: "polygon(0 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%)",
            }}
          >
            LINK ACCOUNT
          </Link>
        </div>

        {/* telemetry readout — real system constants, terminal-styled */}
        <dl className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 data text-xs sm:text-sm" style={{ color: "var(--muted)" }}>
          <Readout k="K-FACTOR" v="32" />
          <span style={{ color: "var(--line)" }}>//</span>
          <Readout k="BASE-ELO" v="1000" />
          <span style={{ color: "var(--line)" }}>//</span>
          <Readout k="LADDERS" v="CREW · IMP" />
        </dl>
      </div>
    </main>
  );
}

function Readout({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="eyebrow" style={{ letterSpacing: "0.18em" }}>{k}</span>
      <span className="glow-num" style={{ color: "var(--signal)" }}>{v}</span>
    </div>
  );
}
