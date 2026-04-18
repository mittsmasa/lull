"use client";

import { useEffect, useState } from "react";

const L_PATH =
  "M264.95 101.12L264.95 113.77L215.55 119.97L215.55 400.60L278.55 400.60Q329.38 400.60 353.24 395.83L353.24 395.83L368.04 329.25L383.55 329.25L379.25 421.12L128.45 421.12L128.45 408.47L169.50 402.03L169.50 119.97L128.45 113.77L128.45 101.12L264.95 101.12Z";
const SEAL_CX = 421.95;
const SEAL_CY = 113.92;

export function AppSplash() {
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (mq.matches) {
        setRemoved(true);
        return;
      }
    }
    const t = setTimeout(() => setRemoved(true), 1100);
    return () => clearTimeout(t);
  }, []);

  if (removed) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-background"
      style={{
        animation: "lull-splash-fade 320ms ease-out 720ms forwards",
      }}
    >
      <svg
        viewBox="0 0 512 512"
        className="h-32 w-32 sm:h-40 sm:w-40"
        role="presentation"
      >
        <path
          d={L_PATH}
          fill="#3A332B"
          style={{
            animation: "lull-splash-rise 480ms ease-out 40ms both",
          }}
        />
        <circle
          cx={SEAL_CX}
          cy={SEAL_CY}
          r={28.8}
          fill="none"
          stroke="#A35E40"
          strokeWidth={3.84}
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "lull-splash-ripple 900ms ease-out 380ms both",
          }}
        />
        <circle
          cx={SEAL_CX}
          cy={SEAL_CY}
          r={14.4}
          fill="#A35E40"
          style={{
            transformBox: "fill-box",
            transformOrigin: "center",
            animation: "lull-splash-pop 360ms ease-out 340ms both",
          }}
        />
      </svg>
    </div>
  );
}
