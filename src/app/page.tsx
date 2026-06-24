import Link from "next/link";

export default function Home() {
  return (
    <main className="relative min-h-[82vh] flex flex-col items-center justify-center text-center overflow-hidden px-6">
      <video autoPlay muted loop playsInline poster="/media/hero.png"
        className="absolute inset-0 w-full h-full object-cover opacity-45">
        <source src="/media/hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent, var(--bg))" }} />
      <div className="relative z-10 max-w-2xl">
        <h1 className="font-display text-5xl sm:text-7xl font-bold tracking-tight">
          Among Us <span style={{ color: "var(--primary)" }}>.25 Ranked</span>
        </h1>
        <p className="mt-5 text-lg sm:text-xl" style={{ color: "var(--muted)" }}>
          Climb the Crew &amp; Impostor ELO ladders. Prove who&apos;s really sus.
        </p>
        <div className="mt-8 flex gap-3 justify-center">
          <Link href="/leaderboard" className="px-6 py-3 rounded-xl font-semibold" style={{ background: "var(--primary)", color: "white" }}>
            View leaderboard
          </Link>
          <Link href="/link" className="px-6 py-3 rounded-xl font-semibold border" style={{ borderColor: "rgba(255,255,255,0.2)", color: "var(--text)" }}>
            Link your account
          </Link>
        </div>
      </div>
    </main>
  );
}
