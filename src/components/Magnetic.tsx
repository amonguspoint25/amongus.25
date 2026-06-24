"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Makes its single child drift toward the cursor when hovered (magnetic effect).
 * Guards: only activates on fine-pointer devices (mouse) AND when motion is allowed.
 * Falls back to rendering children unwrapped when either condition is not met.
 * Uses a ref + direct style writes (no React state per move) for smoothness.
 * CSS transition eases the element back to center on pointerleave.
 */
export function Magnetic({
  children,
  strength = 14,
}: {
  children: ReactNode;
  strength?: number;
}) {
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    // SSR-safe: window is available in effects
    if (
      !window.matchMedia("(pointer:fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const el = wrapperRef.current;
    if (!el) return;

    activeRef.current = true;

    const onPointerMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      // Offset from element center in px
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      // Pull fraction of the offset (capped to strength px)
      const maxDist = Math.max(rect.width, rect.height) * 0.7;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const factor = Math.min(1, strength / maxDist) * (Math.min(dist, maxDist) / maxDist);
      const tx = dx * factor;
      const ty = dy * factor;
      // Direct style write — no React state
      el.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
    };

    const onPointerLeave = () => {
      // CSS transition on wrapper handles the ease-back
      el.style.transform = "translate(0px, 0px)";
    };

    el.addEventListener("pointermove", onPointerMove, { passive: true });
    el.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [strength]);

  return (
    <span
      ref={wrapperRef}
      style={{
        display: "inline-block",
        transform: "translate(0px, 0px)",
        transition: "transform 200ms ease-out",
      }}
    >
      {children}
    </span>
  );
}
