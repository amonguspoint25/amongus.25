"use client";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type Props = {
  value: number;
  duration?: number;
  className?: string;
};

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const fmt = new Intl.NumberFormat();

export function CountUp({ value, duration = 1200, className }: Props): ReactNode {
  const [displayed, setDisplayed] = useState<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const raf = useRef<number>(0);
  const started = useRef(false);

  useEffect(() => {
    // Bail early for reduced motion or no IntersectionObserver
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches || typeof IntersectionObserver === "undefined") {
      setDisplayed(value);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          observer.disconnect();
          const startTime = performance.now();
          const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOut(progress);
            setDisplayed(Math.round(easedProgress * value));
            if (progress < 1) {
              raf.current = requestAnimationFrame(animate);
            } else {
              setDisplayed(value);
            }
          };
          raf.current = requestAnimationFrame(animate);
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {displayed === null ? fmt.format(value) : fmt.format(displayed)}
    </span>
  );
}
