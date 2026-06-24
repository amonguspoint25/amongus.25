"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

const TABS = [
  { href: "/#rankings", label: "Rankings" },
  { href: "/#how", label: "Protocol" },
  { href: "/#tournaments", label: "Tournaments" },
  { href: "/link", label: "Link" },
];

interface MobileMenuProps {
  signIn: React.ReactNode;
}

export function MobileMenu({ signIn }: MobileMenuProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="md:hidden">
      {/* Hamburger / X button */}
      <button
        onClick={toggle}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        style={{
          background: "none",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          padding: "0.5rem",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "4px",
          width: "2rem",
          height: "2rem",
        }}
      >
        {open ? (
          /* X icon */
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <line x1="2" y1="2" x2="16" y2="16" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" />
            <line x1="16" y1="2" x2="2" y2="16" stroke="var(--signal)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          /* Hamburger icon */
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none" aria-hidden>
            <line x1="0" y1="1" x2="18" y2="1" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
            <line x1="0" y1="7" x2="18" y2="7" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
            <line x1="0" y1="13" x2="18" y2="13" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="hud-panel"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 49,
            padding: "1rem 1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
            animation: "mobileMenuEnter 0.25s cubic-bezier(0.16,1,0.3,1) both",
          }}
        >
          {TABS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              onClick={close}
              className="eyebrow"
              style={{
                display: "block",
                padding: "0.75rem 0.5rem",
                borderBottom: "1px solid var(--line)",
                color: "var(--muted)",
                textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--signal)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--muted)"; }}
            >
              {t.label}
            </Link>
          ))}
          <div style={{ paddingTop: "1rem" }}>{signIn}</div>
        </div>
      )}
    </div>
  );
}
