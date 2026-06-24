"use client";

import { useEffect, useRef } from "react";

export function HudCursor() {
  const ringRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  // Lerp target (pointer position)
  const target = useRef({ x: -200, y: -200 });
  // Current ring position (lerped)
  const current = useRef({ x: -200, y: -200 });
  const rafRef = useRef<number>(0);
  const activeRef = useRef(false);

  useEffect(() => {
    const isFinePonter = window.matchMedia("(pointer:fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!isFinePonter || reducedMotion) return;

    activeRef.current = true;
    document.documentElement.classList.add("cursor-none");

    const LERP = 0.22;

    function lerp(a: number, b: number, t: number) {
      return a + (b - a) * t;
    }

    function animate() {
      if (!activeRef.current) return;
      current.current.x = lerp(current.current.x, target.current.x, LERP);
      current.current.y = lerp(current.current.y, target.current.y, LERP);

      const ring = ringRef.current;
      const dot = dotRef.current;
      if (ring) {
        ring.style.transform = `translate(${current.current.x - 13}px, ${current.current.y - 13}px)`;
      }
      if (dot) {
        dot.style.transform = `translate(${target.current.x - 2}px, ${target.current.y - 2}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    }

    function onMove(e: MouseEvent) {
      target.current.x = e.clientX;
      target.current.y = e.clientY;
    }

    function onOver(e: MouseEvent) {
      const el = e.target as Element | null;
      const isInteractive = el?.closest("a, button");
      const ring = ringRef.current;
      if (ring) {
        ring.style.transform = isInteractive
          ? `translate(${current.current.x - 13}px, ${current.current.y - 13}px) scale(1.5)`
          : `translate(${current.current.x - 13}px, ${current.current.y - 13}px) scale(1)`;
      }
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseover", onOver);
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      activeRef.current = false;
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseover", onOver);
      document.documentElement.classList.remove("cursor-none");
    };
  }, []);

  return (
    <>
      {/* Ring — lerps behind pointer */}
      <div
        ref={ringRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "26px",
          height: "26px",
          border: "1.5px solid var(--signal)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 10001,
          mixBlendMode: "normal",
          willChange: "transform",
          transition: "transform 0s, border-color 0.15s",
        }}
      />
      {/* Center dot — tracks exactly */}
      <div
        ref={dotRef}
        aria-hidden
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "4px",
          height: "4px",
          background: "var(--signal)",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 10002,
          willChange: "transform",
        }}
      />
    </>
  );
}
