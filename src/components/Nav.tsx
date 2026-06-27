import Link from "next/link";
import { SignInButton } from "./SignInButton";
import { MobileMenu } from "./MobileMenu";
import { getSessionUser } from "@/lib/sessionUser";

const TABS = [
  { href: "/#rankings", label: "Rankings" },
  { href: "/#how", label: "Protocol" },
  { href: "/#tournaments", label: "Tournaments" },
  { href: "/link", label: "Link" },
];

export async function Nav() {
  // Role tabs: Admin for admins, Host for hosts AND admins (admins are superusers).
  // The first admin reaches /admin by URL once to claim; after that the tab appears.
  // getSessionUser is request-cached, so this shares the lookup with requireAdmin().
  const me = await getSessionUser();
  const roleTabs = [
    ...(me?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    ...(me?.isAdmin || me?.isHost ? [{ href: "/host", label: "Host" }] : []),
  ];
  const tabs = [...TABS, ...roleTabs];
  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: "rgba(6,9,16,0.94)", borderBottom: "1px solid var(--line)", position: "relative" }}
    >
      <nav className="mx-auto max-w-6xl flex items-center gap-4 px-5 sm:px-8 h-14">
        <Link href="/" className="flex items-center gap-2 font-display font-bold tracking-wide">
          <span className="live-dot" aria-hidden />
          <span style={{ color: "var(--ion)" }}>AMONG&nbsp;US</span>
          <span style={{ color: "var(--text)" }}>.25</span>
        </Link>

        {/* Desktop tabs — hidden on mobile */}
        <div className="ml-3 hidden md:flex items-center gap-1">
          {tabs.map((t) => (
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

        {/* Desktop right side — hidden on mobile */}
        <div className="ml-auto hidden md:flex items-center gap-4">
          <span className="eyebrow" aria-hidden>SYS//ONLINE</span>
          <SignInButton />
        </div>

        {/* Mobile right side — hamburger (passes SignInButton as a prop) */}
        <div className="ml-auto md:hidden">
          <MobileMenu signIn={<SignInButton />} extraTabs={roleTabs} />
        </div>
      </nav>
    </header>
  );
}
