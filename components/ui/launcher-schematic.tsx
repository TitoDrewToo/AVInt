"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

type Variant = "stack" | "cube"

/**
 * Launcher hero graphic — wireframe schematic with scroll-reactive tilt and
 * idle 3D drift. Inspired by codewiki.google's hero motion language, ported
 * to our red palette. Renders as the primary visual inside each launcher
 * card, not a decorative overlay.
 *
 *  - stack: perspective document sheets (files / storage)
 *  - cube:  isometric cube containing analytics modules (dashboard / visuals)
 */
export function LauncherSchematic({
  variant,
  className,
}: {
  variant: Variant
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let raf = 0
    const tick = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      // 0 when element center is at viewport bottom, 1 when at top.
      const raw = 1 - (rect.top + rect.height / 2) / vh
      const p = Math.max(-0.3, Math.min(1.3, raw))
      el.style.setProperty("--sp", p.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick)
    }
    tick()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={hostRef}
      aria-hidden
      className={cn(
        "relative h-52 w-full overflow-hidden rounded-xl border border-border/40",
        className,
      )}
      style={{ ["--sp" as string]: "0" }}
    >
      {/* Red radial wash — ambient lighting behind the schematic. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 55%, var(--retro-glow-red) 0%, transparent 62%)",
          opacity: 0.55,
        }}
      />
      {/* Retro grid backdrop — faint, masked at the edges via utility. */}
      <div className="retro-grid-bg absolute inset-0 opacity-50" />

      <style>{LS_CSS}</style>

      <div
        className="ls-stage absolute inset-0 flex items-center justify-center"
        style={{ perspective: "900px" }}
      >
        {variant === "cube" ? <CubeSchematic /> : <StackSchematic />}
      </div>
    </div>
  )
}

const LS_CSS = `
@keyframes ls-drift {
  0%,100% { transform: rotateX(calc(var(--sp,0) * 10deg + 14deg)) rotateY(calc(var(--sp,0) * 22deg - 18deg)) rotateZ(-1deg); }
  50%     { transform: rotateX(calc(var(--sp,0) * 10deg + 16deg)) rotateY(calc(var(--sp,0) * 22deg - 12deg)) rotateZ(1deg); }
}
.ls-stage > svg {
  transform-style: preserve-3d;
  animation: ls-drift 9s ease-in-out infinite;
  will-change: transform;
  max-width: 86%;
  max-height: 86%;
}
@keyframes ls-trace {
  0%   { stroke-dashoffset: 220; opacity: 0.25; }
  45%  { opacity: 1; }
  100% { stroke-dashoffset: 0;   opacity: 0.55; }
}
.ls-trace    { stroke-dasharray: 220; animation: ls-trace 3.2s ease-in-out infinite; }
.ls-trace-d1 { animation-delay: 0.35s; }
.ls-trace-d2 { animation-delay: 0.7s; }
.ls-trace-d3 { animation-delay: 1.05s; }
.ls-trace-d4 { animation-delay: 1.4s; }

@keyframes ls-pulse {
  0%,100% { opacity: 0.25; r: 1.6; }
  50%     { opacity: 1;    r: 2.6; }
}
.ls-pulse    { animation: ls-pulse 2s ease-in-out infinite; }
.ls-pulse-d1 { animation-delay: 0.25s; }
.ls-pulse-d2 { animation-delay: 0.5s; }
.ls-pulse-d3 { animation-delay: 0.75s; }
.ls-pulse-d4 { animation-delay: 1s; }

@keyframes ls-bar {
  0%,100% { transform: scaleY(0.4); opacity: 0.5; }
  55%     { transform: scaleY(1);   opacity: 1;   }
}
.ls-bar    { transform-box: fill-box; transform-origin: bottom center; animation: ls-bar 2.2s ease-in-out infinite; }
.ls-bar-d1 { animation-delay: 0.25s; }
.ls-bar-d2 { animation-delay: 0.5s; }
.ls-bar-d3 { animation-delay: 0.75s; }
.ls-bar-d4 { animation-delay: 1s; }

@media (prefers-reduced-motion: reduce) {
  .ls-stage > svg,
  .ls-trace,
  .ls-pulse,
  .ls-bar { animation: none !important; transform: none !important; }
}
`

// ─── Smart Storage: files / sheets in perspective, with scan traces ─────────

function StackSchematic() {
  return (
    <svg
      viewBox="0 0 260 200"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: "var(--primary)",
        filter: "drop-shadow(0 0 20px var(--retro-glow-red))",
      }}
    >
      {/* Four perspective sheets, back → front. */}
      <g strokeWidth="1">
        {/* Sheet 1 — back */}
        <g opacity="0.22">
          <path d="M44 36 L176 20 L232 42 L100 58 Z" />
          <line x1="72" y1="37" x2="160" y2="27" />
          <line x1="72" y1="44" x2="150" y2="34" />
          <line x1="72" y1="51" x2="140" y2="41" />
        </g>
        {/* Sheet 2 */}
        <g opacity="0.38">
          <path d="M40 78 L180 60 L236 84 L96 102 Z" />
          <line className="ls-trace ls-trace-d1" x1="68" y1="80" x2="168" y2="68" />
          <line x1="68" y1="88" x2="156" y2="76" />
          <line className="ls-trace ls-trace-d2" x1="68" y1="96" x2="148" y2="84" />
        </g>
        {/* Sheet 3 */}
        <g opacity="0.6">
          <path d="M36 122 L184 102 L240 128 L92 148 Z" />
          <line className="ls-trace ls-trace-d3" x1="64" y1="124" x2="174" y2="112" />
          <line x1="64" y1="132" x2="162" y2="120" />
          <line className="ls-trace ls-trace-d4" x1="64" y1="140" x2="152" y2="128" />
        </g>
        {/* Sheet 4 — front */}
        <g opacity="0.85">
          <path d="M32 168 L188 146 L244 174 L88 196 Z" />
          <line className="ls-trace" x1="60" y1="170" x2="180" y2="156" />
          <line x1="60" y1="178" x2="168" y2="164" />
          <line className="ls-trace ls-trace-d2" x1="60" y1="186" x2="158" y2="172" />
        </g>
      </g>

      {/* Scan node — slides along the front sheet via pulse ring */}
      <g fill="currentColor">
        <circle className="ls-pulse"       cx="32"  cy="168" r="2" />
        <circle className="ls-pulse ls-pulse-d1" cx="188" cy="146" r="2" />
        <circle className="ls-pulse ls-pulse-d2" cx="244" cy="174" r="2" />
        <circle className="ls-pulse ls-pulse-d3" cx="88"  cy="196" r="2" />
      </g>

      {/* Vault band at the very bottom — implies storage destination */}
      <g strokeWidth="1" opacity="0.5">
        <path d="M52 190 Q138 205 220 188" />
      </g>
    </svg>
  )
}

// ─── Smart Dashboard: cube with embedded analytics modules ──────────────────

function CubeSchematic() {
  return (
    <svg
      viewBox="0 0 260 210"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: "var(--primary)",
        filter: "drop-shadow(0 0 22px var(--retro-glow-red))",
      }}
    >
      {/* Cube frame (isometric) */}
      <g strokeWidth="1.1" opacity="0.75">
        {/* Back edges */}
        <g opacity="0.35">
          <path d="M40 58 L130 30" />
          <path d="M130 30 L220 58" />
          <path d="M40 58 L220 58" />
          <path d="M130 30 L130 110" />
        </g>
        {/* Front face */}
        <path d="M40 58 L40 158" />
        <path d="M220 58 L220 158" />
        <path d="M40 158 L130 188" />
        <path d="M220 158 L130 188" />
        <path d="M130 110 L130 188" />
        <path d="M40 158 L130 130 L220 158" />
        <path d="M130 130 L130 110" />
        <path d="M40 58 L130 88 L220 58" />
        <path d="M130 88 L130 110" />
      </g>

      {/* Bar-chart module inside left face */}
      <g strokeWidth="1.2" fill="currentColor">
        <rect className="ls-bar"       x="52"  y="110" width="8" height="32" rx="1" opacity="0.7" />
        <rect className="ls-bar ls-bar-d1" x="66"  y="98"  width="8" height="44" rx="1" opacity="0.85" />
        <rect className="ls-bar ls-bar-d2" x="80"  y="116" width="8" height="26" rx="1" opacity="0.7" />
        <rect className="ls-bar ls-bar-d3" x="94"  y="104" width="8" height="38" rx="1" opacity="0.9" />
        <rect className="ls-bar ls-bar-d4" x="108" y="120" width="8" height="22" rx="1" opacity="0.7" />
      </g>

      {/* Trend line on right face */}
      <g strokeWidth="1.4">
        <polyline
          className="ls-trace"
          points="150,150 164,136 178,142 192,118 206,126"
          opacity="0.85"
        />
      </g>

      {/* Data nodes along trend line */}
      <g fill="currentColor">
        <circle className="ls-pulse"       cx="150" cy="150" r="2" />
        <circle className="ls-pulse ls-pulse-d1" cx="164" cy="136" r="2" />
        <circle className="ls-pulse ls-pulse-d2" cx="178" cy="142" r="2" />
        <circle className="ls-pulse ls-pulse-d3" cx="192" cy="118" r="2" />
        <circle className="ls-pulse ls-pulse-d4" cx="206" cy="126" r="2" />
      </g>

      {/* Sparkle accent above tallest bar — motion signature */}
      <g fill="currentColor" opacity="0.9">
        <path className="ls-pulse" d="M70 84 l1.2 3.6 3.6 1.2 -3.6 1.2 -1.2 3.6 -1.2 -3.6 -3.6 -1.2 3.6 -1.2 z" />
      </g>

      {/* Cube accent corners */}
      <g fill="currentColor">
        <circle cx="40"  cy="58"  r="1.6" />
        <circle cx="220" cy="58"  r="1.6" />
        <circle cx="130" cy="30"  r="1.6" />
        <circle cx="130" cy="188" r="1.6" />
      </g>
    </svg>
  )
}
