"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Wraps its child with a subtle 3D tilt toward the cursor.
 * Guards: only activates on fine-pointer devices (mouse) AND when motion is allowed.
 * Falls back to a plain div when either condition is not met.
 * Uses a ref + direct style writes (no React state per move) for smoothness.
 * CSS transition eases the tilt back to flat on pointerleave.
 */
export function TiltCard({
  children,
  className,
  max = 7,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    // SSR-safe: window is available in effects
    if (
      !window.matchMedia("(pointer:fine)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    activeRef.current = true;

    const onPointerMove = (e: PointerEvent) => {
      const rect = outer.getBoundingClientRect();
      // Normalize cursor position relative to element center: -0.5 .. 0.5
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      // rotateX uses negated vertical offset: top edge tilts back when cursor is at top
      const rx = -(ny * max);
      const ry = nx * max;
      // Direct style write — no React state
      inner.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
      // Faint sheen: a subtle highlight that follows the cursor
      const sheenX = (nx + 0.5) * 100;
      const sheenY = (ny + 0.5) * 100;
      inner.style.setProperty("--sheen-x", `${sheenX}%`);
      inner.style.setProperty("--sheen-y", `${sheenY}%`);
      inner.style.setProperty("--sheen-opacity", "0.06");
    };

    const onPointerLeave = () => {
      // CSS transition on inner handles the ease-back
      inner.style.transform = "rotateX(0deg) rotateY(0deg)";
      inner.style.setProperty("--sheen-opacity", "0");
    };

    outer.addEventListener("pointermove", onPointerMove, { passive: true });
    outer.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return () => {
      outer.removeEventListener("pointermove", onPointerMove);
      outer.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [max]);

  return (
    <div
      ref={outerRef}
      style={{ perspective: "800px" }}
    >
      <div
        ref={innerRef}
        className={className}
        style={{
          transformStyle: "preserve-3d",
          transform: "rotateX(0deg) rotateY(0deg)",
          transition: "transform 150ms ease-out",
          position: "relative",
        }}
      >
        {children}
        {/* Faint dynamic sheen overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            pointerEvents: "none",
            background:
              "radial-gradient(circle at var(--sheen-x, 50%) var(--sheen-y, 50%), rgba(255,255,255,0.35) 0%, transparent 60%)",
            opacity: "var(--sheen-opacity, 0)",
            transition: "opacity 200ms ease-out",
          }}
        />
      </div>
    </div>
  );
}
