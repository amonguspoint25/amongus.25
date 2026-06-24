import type { Metadata } from "next";
import { Geist, Chakra_Petch, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ScrollProgress } from "@/components/ScrollProgress";
import { BootIntro } from "@/components/BootIntro";
import { HudCursor } from "@/components/HudCursor";

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

export const metadata: Metadata = {
  title: "Among Us .25 Ranked",
  description: "Climb the Crew & Impostor ELO ladders on the .25 ranked server.",
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
        <Nav />
        {children}
      </body>
    </html>
  );
}
