"use client";

import { useEffect, useRef } from "react";

/**
 * Custom HUD reticle cursor. Event-driven (no permanent rAF): the ring trails
 * the pointer purely via a CSS transition, the dot tracks exactly. Only active
 * on fine pointers when motion is allowed.
 */
export function HudCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer:fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;

    document.documentElement.classList.add("cursor-none");
    let x = -200, y = -200, hover = false;

    const apply = () => {
      const ring = ringRef.current, dot = dotRef.current;
      if (ring) ring.style.transform = `translate(${x - 13}px, ${y - 13}px) scale(${hover ? 1.6 : 1})`;
      if (dot) dot.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
    };
    const onMove = (e: MouseEvent) => { x = e.clientX; y = e.clientY; apply(); };
    const onOver = (e: MouseEvent) => {
      const next = !!(e.target as Element | null)?.closest("a, button, input");
      if (next !== hover) { hover = next; apply(); }
    };

    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseover", onOver, { passive: true });
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.classList.remove("cursor-none");
    };
  }, []);

  return (
    <>
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: "fixed", top: 0, left: 0,
          width: "26px", height: "26px",
          border: "1.5px solid var(--signal)", borderRadius: "50%",
          pointerEvents: "none", zIndex: 10001,
          transition: "transform 0.12s ease-out",
          willChange: "transform",
        }}
      />
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: "fixed", top: 0, left: 0,
          width: "4px", height: "4px",
          background: "var(--signal)", borderRadius: "50%",
          pointerEvents: "none", zIndex: 10002,
          willChange: "transform",
        }}
      />
    </>
  );
}
