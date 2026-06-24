"use client";

import { useEffect, useState } from "react";

const LINES = [
  "> INITIALIZING .25 RANKED TERMINAL",
  "> ESTABLISHING UPLINK ............ OK",
  "> LOADING CREW MANIFEST .......... OK",
  "> SYS//ONLINE",
];

const LINE_DELAY_MS = 180;
const FADE_DELAY_MS = 1600;
const FADE_DURATION_MS = 400;

export function BootIntro() {
  const [show, setShow] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);
  const [fading, setFading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // SSR-safe: all window/sessionStorage access here
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const alreadyBooted = sessionStorage.getItem("aus25-booted");

    if (reducedMotion || alreadyBooted) {
      sessionStorage.setItem("aus25-booted", "1");
      return;
    }

    setShow(true);

    // Reveal lines one by one
    const lineTimers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < LINES.length; i++) {
      lineTimers.push(
        setTimeout(() => setVisibleLines(i + 1), (i + 1) * LINE_DELAY_MS)
      );
    }

    // Begin fade out after all lines shown
    const fadeTimer = setTimeout(() => setFading(true), FADE_DELAY_MS);

    // Unmount after fade complete
    const doneTimer = setTimeout(() => {
      sessionStorage.setItem("aus25-booted", "1");
      setDone(true);
    }, FADE_DELAY_MS + FADE_DURATION_MS);

    return () => {
      lineTimers.forEach(clearTimeout);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  function dismiss() {
    if (!show) return;
    setFading(true);
    setTimeout(() => {
      sessionStorage.setItem("aus25-booted", "1");
      setDone(true);
    }, FADE_DURATION_MS);
  }

  useEffect(() => {
    if (!show) return;
    function onKey() { dismiss(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  if (!show || done) return null;

  return (
    <div
      onClick={dismiss}
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--void)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease`,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono), ui-monospace, monospace",
          fontSize: "clamp(0.85rem, 2vw, 1.05rem)",
          color: "var(--signal)",
          padding: "2rem",
          maxWidth: "36rem",
          width: "100%",
        }}
      >
        {LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} style={{ marginBottom: "0.75rem" }}>
            {line}
          </div>
        ))}
        {visibleLines > 0 && visibleLines < LINES.length && (
          <span
            style={{
              display: "inline-block",
              width: "0.65ch",
              height: "1.1em",
              background: "var(--signal)",
              verticalAlign: "text-bottom",
              animation: "bootCursor 0.9s step-end infinite",
            }}
          />
        )}
        {visibleLines >= LINES.length && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
            <span className="live-dot" />
            <span style={{ fontSize: "0.72rem", letterSpacing: "0.22em", textTransform: "uppercase", opacity: 0.7 }}>
              SYSTEM READY — CLICK OR PRESS ANY KEY
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
