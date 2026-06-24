"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * "Living still" hero: a static image given depth via pointer parallax.
 * Background image, floating light orbs, and the content layer each move by a
 * different amount based on cursor position (smoothly eased with rAF), creating
 * a 2.5D depth effect — no video, so nothing can morph. Reduced-motion safe.
 */
export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let targetX = 0, targetY = 0; // -0.5..0.5
    let curX = 0, curY = 0;

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      curX += (targetX - curX) * 0.06;
      curY += (targetY - curY) * 0.06;
      el.style.setProperty("--px", curX.toFixed(4));
      el.style.setProperty("--py", curY.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="hero-stage">
      <div className="hero-img" aria-hidden />
      <div className="hero-orb hero-orb-a" aria-hidden />
      <div className="hero-orb hero-orb-b" aria-hidden />
      <div className="hero-vignette" aria-hidden />
      <div className="hero-frame hud-corners" aria-hidden />
      <div className="hero-content">{children}</div>
      <div className="hero-scrollcue" aria-hidden>
        <span className="eyebrow">SCROLL</span>
        <span className="scroll-cue" />
      </div>
    </div>
  );
}
