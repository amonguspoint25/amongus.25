import Link from "next/link";
import { SignInButton } from "./SignInButton";

export function Nav() {
  return (
    <nav className="flex items-center gap-6 px-6 sm:px-8 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
      <Link href="/" className="font-display font-bold text-lg" style={{ color: "var(--primary)" }}>
        Among Us <span style={{ color: "var(--text)" }}>.25 Ranked</span>
      </Link>
      <Link href="/leaderboard" style={{ color: "var(--muted)" }}>Leaderboard</Link>
      <Link href="/tournaments" style={{ color: "var(--muted)" }}>Tournaments</Link>
      <Link href="/link" style={{ color: "var(--muted)" }}>Link</Link>
      <div className="ml-auto"><SignInButton /></div>
    </nav>
  );
}
