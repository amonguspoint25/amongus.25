"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * "Living still" hero, composited from two layers so the ROOM animates but the
 * CREWMATES stay frozen: `.hero-bg` (character-free room plate) gets the
 * ambient drift + pointer parallax + scroll zoom; `.hero-chars` (transparent
 * cutout) sits static on top and only fades on scroll. No video → no morphing.
 * Reduced-motion safe.
 */
export function HeroParallax({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    let targetX = 0, targetY = 0; // pointer, -0.5..0.5
    let curX = 0, curY = 0;
    let curSp = 0; // smoothed scroll progress through the hero, 0..1

    const onMove = (e: PointerEvent) => {
      targetX = e.clientX / window.innerWidth - 0.5;
      targetY = e.clientY / window.innerHeight - 0.5;
    };
    const tick = () => {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      // scroll progress: 0 at top of hero, 1 once scrolled ~90% past it
      const sp = Math.min(1, Math.max(0, window.scrollY / (el.offsetHeight * 0.9)));
      curSp += (sp - curSp) * 0.18;
      el.style.setProperty("--px", curX.toFixed(4));
      el.style.setProperty("--py", curY.toFixed(4));
      el.style.setProperty("--sp", curSp.toFixed(4));
      // Stop the loop once the hero is fully scrolled away (resume on re-entry).
      if (curSp < 0.999 || Math.abs(targetX - curX) > 0.001) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const onPointer = (e: PointerEvent) => { onMove(e); kick(); };

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", kick, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", kick);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} className="hero-stage">
      <div className="hero-bg" aria-hidden />
      <div className="hero-orb hero-orb-a" aria-hidden />
      <div className="hero-orb hero-orb-b" aria-hidden />
      <div className="hero-chars" aria-hidden />
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
