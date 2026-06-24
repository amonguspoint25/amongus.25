import Link from "next/link";
import { SignInButton } from "./SignInButton";

const TABS = [
  { href: "/leaderboard", label: "Rankings" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/link", label: "Link" },
];

export function Nav() {
  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md"
      style={{ background: "rgba(5,7,13,0.82)", borderBottom: "1px solid var(--line)" }}
    >
      <nav className="mx-auto max-w-6xl flex items-center gap-4 px-5 sm:px-8 h-14">
        <Link href="/" className="flex items-center gap-2 font-display font-bold tracking-wide">
          <span className="live-dot" aria-hidden />
          <span style={{ color: "var(--ion)" }}>AMONG&nbsp;US</span>
          <span style={{ color: "var(--text)" }}>.25</span>
        </Link>

        <div className="ml-3 hidden md:flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="px-3 py-1.5 text-sm rounded-sm transition-colors hover:text-[var(--signal)]"
              style={{ color: "var(--muted)" }}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <span className="eyebrow hidden sm:inline" aria-hidden>SYS//ONLINE</span>
          <SignInButton />
        </div>
      </nav>
    </header>
  );
}
