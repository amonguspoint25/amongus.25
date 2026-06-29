import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ScrollProgress } from "@/components/ScrollProgress";
import { BootIntro } from "@/components/BootIntro";
import { HudCursor } from "@/components/HudCursor";
import { CommandPalette } from "@/components/CommandPalette";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

// Squared techno display face — the ship-console headings.
const display = Chakra_Petch({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Terminal readout — all data, ELO numbers, labels.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const DESCRIPTION = "Climb the Crew & Impostor ELO ladders on the .25 ranked server.";

export const metadata: Metadata = {
  metadataBase: new URL("https://amongus25.com"),
  title: "Among Us .25 Ranked",
  description: DESCRIPTION,
  // OG/Twitter images come from app/opengraph-image.tsx automatically.
  openGraph: {
    title: "Among Us .25 Ranked",
    description: DESCRIPTION,
    url: "/",
    siteName: "Among Us .25 Ranked",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "Among Us .25 Ranked", description: DESCRIPTION },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ScrollProgress />
        <BootIntro />
        <HudCursor />
        <CommandPalette />
        <Nav />
        {children}
        <footer style={{ marginTop: "auto", borderTop: "1px solid var(--line)", padding: "1.5rem", textAlign: "center" }}>
          <p className="eyebrow" style={{ color: "var(--muted)" }}>
            <Link href="/privacy">Privacy</Link>
            {" · "}
            <Link href="/account">Account</Link>
            {" · "}Among Us .25 Ranked
          </p>
        </footer>
      </body>
    </html>
  );
}
