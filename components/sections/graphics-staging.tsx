"use client"

import { useEffect, useRef, useState } from "react"

type OrbitPanelKey = "back" | "front" | "side"

const SAFARI_ORBIT_BASE: Record<OrbitPanelKey, { transform: string; opacity: string }> = {
  back: {
    transform: "translate(-50%, -50%) rotate(0deg) translateX(104px) rotate(0deg) rotateZ(-6deg) scale(0.92)",
    opacity: "0.56",
  },
  front: {
    transform: "translate(-50%, -50%) rotate(120deg) translateX(104px) rotate(-120deg) rotateZ(0deg) scale(1.06)",
    opacity: "0.96",
  },
  side: {
    transform: "translate(-50%, -50%) rotate(240deg) translateX(104px) rotate(-240deg) rotateZ(6deg) scale(0.92)",
    opacity: "0.56",
  },
}

const SAFARI_ORBIT_HOVER: Record<OrbitPanelKey, { transform: string; opacity: string }> = {
  back: {
    transform: "translate(-50%, -50%) translate3d(-94px, 4px, -18px) rotateZ(-8deg) scale(0.92)",
    opacity: "0.52",
  },
  front: {
    transform: "translate(-50%, -50%) translate3d(0px, -16px, 12px) rotateZ(0deg) scale(1.08)",
    opacity: "0.98",
  },
  side: {
    transform: "translate(-50%, -50%) translate3d(94px, 4px, -18px) rotateZ(8deg) scale(0.92)",
    opacity: "0.52",
  },
}

const SAFARI_ORBIT_MOVE_MS = 520
const ORBIT_TRANSITION = `transform ${SAFARI_ORBIT_MOVE_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 260ms ease`

function SharedGraphicsStyles() {
  return (
    <style>{`
      @property --carousel-angle {
        syntax: "<angle>";
        inherits: false;
        initial-value: 0deg;
      }
      @keyframes graphics-code-slide {
        0% { transform: translateX(-12%); opacity: 0.08; }
        45% { opacity: 0.55; }
        100% { transform: translateX(8%); opacity: 0.12; }
      }
      @keyframes graphics-doc-wall {
        from { transform: translateY(0%); }
        to { transform: translateY(-50%); }
      }
      @keyframes graphics-chart-breathe {
        0%, 100% { transform: scaleY(1) translateY(0); opacity: 0.72; }
        50% { transform: scaleY(1.12) translateY(-3px); opacity: 1; }
      }
      @keyframes graphics-spin-slow {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      @keyframes graphics-line-trace {
        0% { stroke-dashoffset: 220; opacity: 0.2; }
        30% { opacity: 1; }
        100% { stroke-dashoffset: 0; opacity: 0.55; }
      }
      @keyframes graphics-slide-pulse {
        0%, 100% { transform: translateX(0); opacity: 0.28; }
        50% { transform: translateX(5px); opacity: 0.78; }
      }
      @keyframes graphics-browser-bg-scroll {
        from { transform: translateY(0%); }
        to { transform: translateY(-18%); }
      }
      @keyframes graphics-browser-run {
        0% { --browser-angle: 0deg; }
        100% { --browser-angle: 360deg; }
      }
      @keyframes graphics-collapse-idle {
        0%, 100% { transform: translateY(0px) rotateZ(0deg); }
        50% { transform: translateY(var(--collapse-idle-y, -7px)) rotateZ(var(--collapse-idle-rotate, -0.7deg)); }
      }
      @keyframes graphics-carousel {
        from { --carousel-angle: 0deg; }
        to { --carousel-angle: 360deg; }
      }
      @keyframes graphics-orbit-back-spin {
        from {
          transform: translate(-50%, -50%) rotate(0deg) translateX(104px) rotate(0deg) rotateZ(-6deg) scale(0.92);
        }
        to {
          transform: translate(-50%, -50%) rotate(360deg) translateX(104px) rotate(-360deg) rotateZ(-6deg) scale(0.92);
        }
      }
      @keyframes graphics-orbit-front-spin {
        from {
          transform: translate(-50%, -50%) rotate(120deg) translateX(104px) rotate(-120deg) rotateZ(0deg) scale(1.06);
        }
        to {
          transform: translate(-50%, -50%) rotate(480deg) translateX(104px) rotate(-480deg) rotateZ(0deg) scale(1.06);
        }
      }
      @keyframes graphics-orbit-side-spin {
        from {
          transform: translate(-50%, -50%) rotate(240deg) translateX(104px) rotate(-240deg) rotateZ(6deg) scale(0.92);
        }
        to {
          transform: translate(-50%, -50%) rotate(600deg) translateX(104px) rotate(-600deg) rotateZ(6deg) scale(0.92);
        }
      }
      .graphics-code-line {
        animation: graphics-code-slide 4.6s linear infinite;
      }
      .graphics-browser-bg {
        transition: opacity 380ms ease;
        will-change: transform, opacity;
      }
      .graphics-browser-scroll-field {
        will-change: transform;
      }
      .graphics-browser-card,
      .graphics-browser-pill,
      .graphics-browser-dot {
        box-shadow: 0 0 22px -12px color-mix(in oklab, var(--retro-glow-red) 34%, transparent);
      }
      .graphics-orbit {
        transition:
          transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
          opacity 320ms ease;
        transform-style: preserve-3d;
        backface-visibility: hidden;
        will-change: transform, opacity;
        contain: layout paint style;
      }
      .graphics-orbit-back {
        --carousel-offset: 0deg;
        transform:
          translate(-50%, -50%)
          rotate(calc(var(--carousel-angle, 0deg) + var(--carousel-offset)))
          translateX(104px)
          rotate(calc((var(--carousel-angle, 0deg) + var(--carousel-offset)) * -1))
          rotateZ(-6deg)
          scale(0.92);
        opacity: 0.56;
        animation: graphics-carousel var(--graphics-carousel-duration, 9.2s) linear infinite;
      }
      .graphics-orbit-front {
        --carousel-offset: 120deg;
        transform:
          translate(-50%, -50%)
          rotate(calc(var(--carousel-angle, 0deg) + var(--carousel-offset)))
          translateX(104px)
          rotate(calc((var(--carousel-angle, 0deg) + var(--carousel-offset)) * -1))
          rotateZ(0deg)
          scale(1.06);
        opacity: 0.96;
        animation: graphics-carousel var(--graphics-carousel-duration, 9.2s) linear infinite;
      }
      .graphics-orbit-side {
        --carousel-offset: 240deg;
        transform:
          translate(-50%, -50%)
          rotate(calc(var(--carousel-angle, 0deg) + var(--carousel-offset)))
          translateX(104px)
          rotate(calc((var(--carousel-angle, 0deg) + var(--carousel-offset)) * -1))
          rotateZ(6deg)
          scale(0.92);
        opacity: 0.56;
        animation: graphics-carousel var(--graphics-carousel-duration, 9.2s) linear infinite;
      }
      .graphics-float-hover .graphics-orbit-back,
      .graphics-float-hover .graphics-orbit-front,
      .graphics-float-hover .graphics-orbit-side {
        animation-play-state: paused;
        animation-timing-function: linear;
      }
      .graphics-float-group[data-card-hovered="false"] .graphics-orbit-back,
      .graphics-float-group[data-card-hovered="false"] .graphics-orbit-front,
      .graphics-float-group[data-card-hovered="false"] .graphics-orbit-side {
        animation-play-state: running;
      }
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-back,
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-front,
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-side {
        animation-play-state: paused;
      }
      .graphics-float-group.graphics-float-hover:not(:hover) .graphics-orbit-back,
      .graphics-float-group.graphics-float-hover:not(:hover) .graphics-orbit-front,
      .graphics-float-group.graphics-float-hover:not(:hover) .graphics-orbit-side {
        animation-play-state: running;
      }
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-back {
        transform: translate(-50%, -50%) translate3d(-94px, 4px, -18px) rotateZ(-8deg) scale(0.92) !important;
        opacity: 0.52 !important;
      }
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-front {
        transform: translate(-50%, -50%) translate3d(0px, -16px, 12px) rotateZ(0deg) scale(1.08) !important;
        opacity: 0.98 !important;
      }
      .graphics-float-group[data-card-hovered="true"] .graphics-orbit-side {
        transform: translate(-50%, -50%) translate3d(94px, 4px, -18px) rotateZ(8deg) scale(0.92) !important;
        opacity: 0.52 !important;
      }
      .graphics-float-group:not([data-card-hovered]):hover .graphics-orbit-back {
        transform: translate(-50%, -50%) translate3d(-94px, 4px, -18px) rotateZ(-8deg) scale(0.92) !important;
        opacity: 0.52 !important;
      }
      .graphics-float-group:not([data-card-hovered]):hover .graphics-orbit-front {
        transform: translate(-50%, -50%) translate3d(0px, -16px, 12px) rotateZ(0deg) scale(1.08) !important;
        opacity: 0.98 !important;
      }
      .graphics-float-group:not([data-card-hovered]):hover .graphics-orbit-side {
        transform: translate(-50%, -50%) translate3d(94px, 4px, -18px) rotateZ(8deg) scale(0.92) !important;
        opacity: 0.52 !important;
      }
      @supports (-webkit-hyphens: none) and (not (-moz-appearance: none)) {
        .graphics-float-group[data-safari-orbit-moving="true"] .graphics-orbit * {
          animation-play-state: paused !important;
        }
        .graphics-float-group[data-safari-orbit-moving="true"] .graphics-orbit {
          transition:
            transform 520ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 260ms ease !important;
        }
        .graphics-float-group[data-card-hovered="false"] .graphics-orbit-back {
          transform: translate(-50%, -50%) rotate(0deg) translateX(104px) rotate(0deg) rotateZ(-6deg) scale(0.92);
          animation-name: graphics-orbit-back-spin;
        }
        .graphics-float-group[data-card-hovered="false"] .graphics-orbit-front {
          transform: translate(-50%, -50%) rotate(120deg) translateX(104px) rotate(-120deg) rotateZ(0deg) scale(1.06);
          animation-name: graphics-orbit-front-spin;
        }
        .graphics-float-group[data-card-hovered="false"] .graphics-orbit-side {
          transform: translate(-50%, -50%) rotate(240deg) translateX(104px) rotate(-240deg) rotateZ(6deg) scale(0.92);
          animation-name: graphics-orbit-side-spin;
        }
      }
      .graphics-browser-flow {
        position: absolute;
        isolation: isolate;
      }
      .graphics-browser-flow::before {
        content: "";
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        border: 1px solid rgba(255,255,255,0.08);
        pointer-events: none;
        z-index: 3;
      }
      .graphics-browser-flow::after {
        content: "";
        position: absolute;
        inset: -1px;
        border-radius: inherit;
        padding: 1px;
        background:
          conic-gradient(
            from var(--browser-angle, 0deg),
            transparent 0deg,
            transparent 56deg,
            color-mix(in oklab, var(--retro-glow-red) 100%, transparent) 84deg,
            color-mix(in oklab, var(--retro-glow-red) 84%, transparent) 102deg,
            transparent 124deg,
            transparent 236deg,
            color-mix(in oklab, var(--retro-glow-red) 88%, transparent) 264deg,
            color-mix(in oklab, var(--retro-glow-red) 72%, transparent) 282deg,
            transparent 304deg,
            transparent 360deg
          );
        -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
        -webkit-mask-composite: xor;
        mask:
          linear-gradient(#000 0 0) content-box,
          linear-gradient(#000 0 0);
        mask-composite: exclude;
        pointer-events: none;
        z-index: 4;
        opacity: 0.96;
        animation: graphics-browser-run 5.2s linear infinite;
        filter: drop-shadow(0 0 8px color-mix(in oklab, var(--retro-glow-red) 18%, transparent));
      }
      .graphics-collapse-idle {
        animation: graphics-collapse-idle 5.8s ease-in-out infinite;
        transform-origin: 50% 50%;
        will-change: transform;
      }
    `}</style>
  )
}

function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgress(0.5)
      return
    }

    let raf = 0
    const update = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight || 1
      const start = vh * 0.95
      const end = vh * 0.15
      const center = rect.top + rect.height / 2
      const raw = (start - center) / Math.max(1, start - end)
      setProgress(Math.min(1, Math.max(0, raw)))
    }

    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return { ref, progress }
}

function StagingCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <article className="glass-surface relative overflow-hidden rounded-[1.75rem] border border-border/50 p-6 md:p-7">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--retro-glow-red) 14%, transparent) 0%, transparent 100%)",
        }}
      />
      <div className="relative">
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-primary/80">{eyebrow}</p>
        <h3 className="mt-3 text-xl font-semibold text-foreground md:text-2xl">{title}</h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="relative mt-8">{children}</div>
    </article>
  )
}

export function CollapseBoxGraphic({
  embedded = false,
  hovered: controlledHovered,
  className = "",
}: {
  embedded?: boolean
  hovered?: boolean
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = useState(false)
  const collapse = (controlledHovered ?? hovered) ? 1 : 0

  const lerp = (from: number, to: number) => from + (to - from) * collapse

  function DocumentFace({
    type,
    accent = 1,
  }: {
    type: "receipt" | "statement" | "invoice" | "report"
    accent?: number
  }) {
    if (type === "report") {
      return (
        <div className="absolute inset-0 p-5">
          <div className="h-3 w-28 bg-primary/22" />
          <div className="mt-3 h-2 w-20 bg-primary/12" />
          <div className="mt-6 space-y-3">
            <div className="h-px w-full bg-primary/14" />
            <div className="h-px w-[88%] bg-primary/12" />
            <div className="h-px w-[76%] bg-primary/10" />
            <div className="mt-4 h-2 w-24 bg-primary/14" />
            <div className="mt-3 h-16 bg-primary/8" />
            <div className="mt-4 h-2 w-18 bg-primary/14" />
            <div className="mt-3 h-px w-full bg-primary/10" />
            <div className="mt-3 h-px w-[72%] bg-primary/10" />
          </div>
        </div>
      )
    }

    return (
      <div className="absolute inset-0 p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="h-2.5 w-20 bg-primary/18" />
            <div className="h-2 w-12 bg-primary/10" />
          </div>
          <div className="h-7 w-7 border border-primary/16 bg-primary/6" />
        </div>
        <div className="mt-5 space-y-2.5">
          <div className="h-px w-full bg-primary/14" />
          <div className="h-px w-[82%] bg-primary/12" />
          <div className="h-px w-[72%] bg-primary/10" />
        </div>
        <div className="mt-6">
          {type === "receipt" ? (
            <div className="flex items-end gap-2">
              {[24, 36, 20, 42].map((h, i) => (
                <span key={i} className="block w-4 bg-primary/20" style={{ height: `${h * accent}px` }} />
              ))}
            </div>
          ) : type === "statement" ? (
            <svg viewBox="0 0 110 54" className="h-16 w-full text-primary/34">
              <path d="M4 40C16 38 22 22 36 24C50 26 54 12 66 12C80 12 86 28 98 22C102 20 104 18 106 16" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div className="border border-primary/12 bg-background/12 p-2">
                <div className="h-2 w-10 bg-primary/12" />
                <div className="mt-2 h-10 bg-primary/8" />
              </div>
              <div className="border border-primary/12 bg-background/12 p-2">
                <div className="h-2 w-8 bg-primary/12" />
                <div className="mt-2 h-10 bg-primary/8" />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const panels = [
    {
      key: "receipt",
      face: <DocumentFace type="receipt" />,
      from: { x: -188, y: -18, rotate: -6, z: -10, opacity: 0.9, scale: 1 },
      to: { x: -72, y: 20, rotate: -18, z: -42, opacity: 0, scale: 0.9 },
    },
    {
      key: "invoice",
      face: <DocumentFace type="invoice" accent={0.92} />,
      from: { x: 116, y: 20, rotate: 5, z: -4, opacity: 0.94, scale: 1.02 },
      to: { x: 66, y: 18, rotate: 18, z: -42, opacity: 0, scale: 0.9 },
    },
    {
      key: "report",
      face: <DocumentFace type="report" />,
      from: { x: 0, y: 22, rotate: 1, z: 10, opacity: 0.88, scale: 1.02 },
      to: { x: 0, y: -4, rotate: 0, z: 46, opacity: 1, scale: 1.08 },
    },
  ] as const

  return (
    <div
      ref={ref}
      className={`relative mx-auto overflow-hidden ${embedded ? "h-full w-full max-w-none rounded-none" : "h-[25rem] max-w-4xl rounded-[1.5rem]"} ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <SharedGraphicsStyles />
      <div
        className={`absolute left-1/2 ${embedded ? "top-[72%] h-32 w-[15rem]" : "top-[70%] h-72 w-[34rem]"} -translate-x-1/2 -translate-y-1/2 rounded-full`}
        style={{
          background: "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 36%, transparent) 0%, transparent 68%)",
          filter: "blur(34px)",
          opacity: 0.72,
        }}
      />

      <div className={`absolute inset-0 flex ${embedded ? "items-center justify-center pt-8" : "items-center justify-center"}`} style={{ perspective: "1400px" }}>
        <div
          className={`relative ${embedded ? "h-[9.75rem] w-[14rem]" : "h-56 w-[42rem]"}`}
          style={{
            transformStyle: "preserve-3d",
            transform: `translateY(${lerp(0, 16)}px) rotateX(${lerp(10, 18)}deg) rotateY(${lerp(-8, -18)}deg) rotateZ(${lerp(0, -4)}deg)`,
            transition: "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {panels.map((panel) => (
            <div
              key={panel.key}
              className="absolute left-1/2 top-1/2 h-44 w-44"
              style={{
                transform: `
                  translate3d(calc(-50% + ${lerp(panel.from.x, panel.to.x)}px), calc(-50% + ${lerp(panel.from.y, panel.to.y)}px), ${lerp(panel.from.z, panel.to.z)}px)
                  rotateZ(${lerp(panel.from.rotate, panel.to.rotate)}deg)
                  scale(${lerp(panel.from.scale, panel.to.scale)})
                `,
                opacity: lerp(panel.from.opacity, panel.to.opacity),
                transition:
                  "transform 560ms cubic-bezier(0.22, 1, 0.36, 1), opacity 420ms ease",
              }}
            >
              <div
                className="graphics-collapse-idle relative h-full w-full rounded-none border border-primary/40 bg-background/55 backdrop-blur-sm"
                style={{
                  boxShadow: "inset 0 1px 0 color-mix(in oklab, var(--retro-glow-red) 14%, transparent)",
                  animationPlayState: collapse > 0 ? "paused" : "running",
                  animationDelay:
                    panel.key === "receipt" ? "-0.2s" :
                    panel.key === "invoice" ? "-2.1s" :
                    "-3.5s",
                  ["--collapse-idle-y" as string]:
                    panel.key === "receipt" ? "-9px" :
                    panel.key === "invoice" ? "-5px" :
                    "-7px",
                  ["--collapse-idle-rotate" as string]:
                    panel.key === "receipt" ? "-1deg" :
                    panel.key === "invoice" ? "0.8deg" :
                    "-0.45deg",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--retro-glow-red) 18%, transparent) 0%, transparent 76%)",
                  }}
                />
                {panel.face}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function FloatingCubeGraphic({
  embedded = false,
  hovered,
  className = "",
}: {
  embedded?: boolean
  hovered?: boolean
  className?: string
}) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>()
  const [orbitCycle, setOrbitCycle] = useState(0)
  const [orbitRunning, setOrbitRunning] = useState(true)
  const [renderedHovered, setRenderedHovered] = useState(hovered ?? false)
  const [safariOrbitMoving, setSafariOrbitMoving] = useState(false)
  const isSafariRef = useRef(false)
  const orbitRefs = useRef<Record<OrbitPanelKey, HTMLDivElement | null>>({
    back: null,
    front: null,
    side: null,
  })
  const safariOrbitTimeoutRef = useRef<number | null>(null)
  const previousHoveredRef = useRef<boolean | undefined>(hovered)
  const lift = 18 - progress * 26
  const rotateX = 6 + progress * 8
  const rotateY = -16 + progress * 10
  const spread = 46 - progress * 18
  const chartOpacity = 0.72 + progress * 0.22

  useEffect(() => {
    const ua = window.navigator.userAgent
    isSafariRef.current = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua)
  }, [])

  useEffect(() => {
    return () => {
      if (safariOrbitTimeoutRef.current != null) {
        window.clearTimeout(safariOrbitTimeoutRef.current)
        safariOrbitTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (hovered == null) return

    const wasHovered = previousHoveredRef.current
    previousHoveredRef.current = hovered

    const clearSafariTimer = () => {
      if (safariOrbitTimeoutRef.current != null) {
        window.clearTimeout(safariOrbitTimeoutRef.current)
        safariOrbitTimeoutRef.current = null
      }
    }

    const animateSafariOrbit = (target: Record<OrbitPanelKey, { transform: string; opacity: string }>) => {
      clearSafariTimer()
      setSafariOrbitMoving(true)
      ;(Object.keys(orbitRefs.current) as OrbitPanelKey[]).forEach((key) => {
        const el = orbitRefs.current[key]
        if (!el) return
        const computed = window.getComputedStyle(el)
        el.style.animation = "none"
        el.style.transition = "none"
        el.style.transform = computed.transform === "none" ? SAFARI_ORBIT_BASE[key].transform : computed.transform
        el.style.opacity = computed.opacity
      })

      orbitRefs.current.front?.offsetWidth

      window.requestAnimationFrame(() => {
        ;(Object.keys(orbitRefs.current) as OrbitPanelKey[]).forEach((key) => {
          const el = orbitRefs.current[key]
          if (!el) return
          el.style.transition = ORBIT_TRANSITION
          el.style.transform = target[key].transform
          el.style.opacity = target[key].opacity
        })
      })

      safariOrbitTimeoutRef.current = window.setTimeout(() => {
        setSafariOrbitMoving(false)
        safariOrbitTimeoutRef.current = null
      }, SAFARI_ORBIT_MOVE_MS + 40)
    }

    const resetSafariOrbitStyles = () => {
      setSafariOrbitMoving(false)
      ;(Object.keys(orbitRefs.current) as OrbitPanelKey[]).forEach((key) => {
        const el = orbitRefs.current[key]
        if (!el) return
        el.style.animation = ""
        el.style.transition = ""
        el.style.transform = ""
        el.style.opacity = ""
      })
    }

    if (hovered) {
      if (isSafariRef.current) {
        setRenderedHovered(false)
        setOrbitRunning(false)
        animateSafariOrbit(SAFARI_ORBIT_HOVER)
        return
      }

      setRenderedHovered(true)
      setOrbitRunning(false)
      return
    }

    setRenderedHovered(false)

    if (wasHovered) {
      if (isSafariRef.current) {
        animateSafariOrbit(SAFARI_ORBIT_BASE)
        safariOrbitTimeoutRef.current = window.setTimeout(() => {
          resetSafariOrbitStyles()
          setOrbitCycle((value) => value + 1)
          setOrbitRunning(true)
          safariOrbitTimeoutRef.current = null
        }, SAFARI_ORBIT_MOVE_MS + 80)

        return
      }

      const timeoutId = window.setTimeout(() => {
        setOrbitCycle((value) => value + 1)
        setOrbitRunning(true)
      }, 560)

      return () => window.clearTimeout(timeoutId)
    }

    setOrbitRunning(true)
  }, [hovered])

  const documentRows = [
    "Receipt  INV-2026-0417    Vendor: Whole Foods Market",
    "Date 2026-04-12    Card •••• 4408    Total 128.44 USD",
    "Line  Avocados  8.99    Sparkling Water  12.48",
    "Jurisdiction  US-NY    Merchant  Starbucks Reserve",
    "Expense Category  Meals    Tax  6.21    Discount  2.50",
    "Invoice  0041827    Vendor: Best Buy Union Square",
    "Line  USB-C Dock  149.99    HDMI Cable  18.99",
    "Period  2026-04-01 to 2026-04-15    Payment Method  Amex",
    "Vendor: Delta Air Lines    Airfare  418.20    JFK → SFO",
    "Lodging  Marriott Marquis    Total 286.31 USD",
    "Vendor Normalized  Zara    Domain  Fashion / Apparel",
    "Discount Rate  18%    Promo Applied    Subtotal  214.00",
    "Payment Method  Apple Pay    City  Makati    Currency  PHP",
    "Merchant Domain  Gadgets / Equipment    Total 899.00 SGD",
    "Recurring Spend Flag  true    Confidence Score  0.96",
  ]

  return (
    <div
      ref={ref}
      data-card-hovered={hovered == null ? undefined : renderedHovered ? "true" : "false"}
      data-safari-orbit-moving={safariOrbitMoving ? "true" : undefined}
      className={`graphics-float-group graphics-float-hover relative mx-auto overflow-hidden ${embedded ? "h-full w-full max-w-none rounded-none" : "h-[25rem] max-w-4xl rounded-[1.5rem]"} ${className}`}
      style={{ ["--graphics-carousel-duration" as string]: embedded ? "18s" : "22s" }}
    >
      <SharedGraphicsStyles />
      <div
        className={`absolute left-1/2 ${embedded ? "top-[73%] h-32 w-[15rem]" : "top-[72%] h-72 w-[26rem]"} -translate-x-1/2 -translate-y-1/2 rounded-full`}
        style={{
          background: "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 34%, transparent) 0%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.76,
        }}
      />

      <div
        className={`absolute overflow-hidden ${embedded ? "inset-y-[16%] left-[24%] right-[24%]" : "inset-y-[11%] left-[54%] right-[6%]"}`}
        style={{
          maskImage: "radial-gradient(circle at 58% 56%, black 0%, black 56%, transparent 95%)",
          WebkitMaskImage: "radial-gradient(circle at 58% 56%, black 0%, black 56%, transparent 95%)",
        }}
      >
        {[...Array(14)].map((_, i) => (
          <div
            key={i}
            className="graphics-code-line absolute left-8 right-12 h-px bg-primary/30"
            style={{
              top: `${7 + i * 6.5}%`,
              left: `${2 + (i % 3) * 2}%`,
              right: `${4 + (i % 3) * 6}%`,
              opacity: 0.14 + (i % 3) * 0.08,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
        {[0, 1].map((col) => (
          <div
            key={col}
            className="absolute inset-y-[-18%] w-[54%]"
            style={{
              left: `${4 + col * 20}%`,
              animation: `graphics-doc-wall ${11 + col * 1.2}s linear infinite`,
            }}
          >
            {[...documentRows, ...documentRows].map((row, i) => (
              <div
                key={`${col}-${row}-${i}`}
                className="absolute whitespace-nowrap font-mono text-[12px] font-medium tracking-[0.01em] text-primary/42"
                style={{
                  top: `${i * 6.3}%`,
                  left: `${(i % 2) * 5}%`,
                  opacity: 0.2 + (i % 3) * 0.08,
                  textShadow: "0 0 12px color-mix(in oklab, var(--retro-glow-red) 12%, transparent)",
                }}
              >
                {row}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={`absolute inset-0 flex ${embedded ? "items-center justify-center pt-8" : "items-end justify-end pr-4 md:pr-10"}`} style={{ perspective: "1400px" }}>
        <div
          className={`relative ${embedded ? "h-[9.75rem] w-[11rem]" : "h-64 w-[21rem]"}`}
          style={{
            transformStyle: "preserve-3d",
            transform: `translateY(${lift}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
          }}
        >
          <div
            key={`orbit-back-${orbitCycle}`}
            ref={(el) => { orbitRefs.current.back = el }}
            className="graphics-orbit graphics-orbit-back absolute left-1/2 top-1/2"
            style={orbitRunning ? undefined : { animation: "none" }}
          >
            <div
              className="graphics-float-back relative h-44 w-44 border border-primary/28 bg-background/26 backdrop-blur-md"
              style={{
                boxShadow: "0 20px 60px -36px var(--retro-glow-red)",
              }}
            >
              <div className="absolute inset-x-4 top-4 h-3 bg-primary/10" />
              <div className="absolute inset-x-5 top-12 flex items-end gap-2">
                {[28, 50, 34, 66].map((h, i) => (
                  <span
                    key={i}
                    className="block w-5 bg-primary/22"
                    style={{
                      height: `${h}px`,
                      animation: `graphics-chart-breathe ${2.7 + i * 0.25}s ease-in-out infinite`,
                      animationDelay: `${i * -0.18}s`,
                    }}
                  />
                ))}
              </div>
              <div className="absolute inset-x-5 bottom-8 h-20">
                <svg viewBox="0 0 140 72" className="h-full w-full text-primary/38">
                  <path
                    d="M6 54C20 48 28 40 40 42C52 44 60 24 74 20C86 17 96 34 108 30C118 27 124 18 134 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: "180",
                      strokeDashoffset: "180",
                      animation: "graphics-line-trace 3.2s ease-in-out infinite",
                    }}
                  />
                </svg>
              </div>
            </div>
          </div>
          <div
            key={`orbit-front-${orbitCycle}`}
            ref={(el) => { orbitRefs.current.front = el }}
            className="graphics-orbit graphics-orbit-front absolute left-1/2 top-1/2"
            style={orbitRunning ? undefined : { animation: "none" }}
          >
            <div
              className="graphics-float-front relative h-48 w-48 border border-primary/40 bg-background/32 backdrop-blur-md"
              style={{
                boxShadow:
                  "inset 0 1px 0 color-mix(in oklab, var(--retro-glow-red) 18%, transparent), 0 24px 72px -42px var(--retro-glow-red)",
              }}
            >
              <div className="absolute inset-x-5 top-5 flex items-center justify-between">
                <div className="h-3 w-20 rounded-full bg-primary/18" />
                <div className="h-7 w-7 rounded-full border border-primary/28 bg-primary/8" />
              </div>
              <div className="absolute inset-x-5 top-16 h-px bg-primary/14" />
              <div className="absolute inset-x-5 top-20 h-24">
                <svg viewBox="0 0 160 96" className="h-full w-full text-primary/44">
                  <defs>
                    <linearGradient id="area-red" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
                      <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M6 76C20 70 28 56 42 58C56 60 62 38 76 34C92 28 104 50 120 42C132 36 142 28 154 18V90H6Z" fill="url(#area-red)" />
                  <path
                    d="M6 76C20 70 28 56 42 58C56 60 62 38 76 34C92 28 104 50 120 42C132 36 142 28 154 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: "220",
                      strokeDashoffset: "220",
                      animation: "graphics-line-trace 3.8s ease-in-out infinite 0.35s",
                    }}
                  />
                </svg>
              </div>
              <div className="absolute inset-x-5 bottom-6 flex items-end gap-2">
                {[20, 28, 18, 34, 26, 40].map((h, i) => (
                  <span
                    key={i}
                    className="block flex-1 bg-primary/22"
                    style={{
                      height: `${h}px`,
                      animation: `graphics-chart-breathe ${2.4 + i * 0.22}s ease-in-out infinite`,
                      animationDelay: `${i * -0.14}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div
            key={`orbit-side-${orbitCycle}`}
            ref={(el) => { orbitRefs.current.side = el }}
            className="graphics-orbit graphics-orbit-side absolute left-1/2 top-1/2"
            style={orbitRunning ? undefined : { animation: "none" }}
          >
            <div
              className="graphics-float-side relative h-44 w-44 border border-primary/34 bg-background/24 backdrop-blur-md"
              style={{
                boxShadow: "0 18px 56px -38px var(--retro-glow-red)",
              }}
            >
              <div className="absolute inset-x-4 top-5 h-3 bg-primary/12" />
              <div className="absolute inset-x-5 top-[3.9rem] space-y-3">
                <div className="h-12 border border-primary/14 bg-background/12">
                  <div className="mt-3 px-3">
                    <div className="h-px w-full bg-primary/16" />
                    <div className="mt-3 h-px w-[76%] bg-primary/12" />
                    <div className="mt-3 h-px w-[58%] bg-primary/10" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[18, 28, 22].map((h, i) => (
                    <span key={i} className="block bg-primary/18" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>
              <div className="absolute inset-x-6 bottom-8 flex gap-2">
                {[36, 24, 42].map((w, i) => (
                  <span
                    key={i}
                    className="block h-2 bg-primary/16"
                    style={{
                      width: `${w}%`,
                      animation: `graphics-slide-pulse ${2.6 + i * 0.3}s ease-in-out infinite`,
                      animationDelay: `${i * -0.22}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div
            className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background: "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 20%, transparent) 0%, transparent 72%)",
              filter: "blur(22px)",
            }}
          />
        </div>
      </div>
    </div>
  )
}

export function BrowserCubeGraphic({ phase }: { phase?: number }) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>()
  const activePhase = phase ?? progress
  const mixStart = 0.42
  const mixEnd = 0.58
  const mix = Math.min(1, Math.max(0, (activePhase - mixStart) / (mixEnd - mixStart)))
  const bg1Opacity = 1 - mix
  const bg2Opacity = mix
  const scrollOffset = -(activePhase * 82)
  const browserBg1 = [
    { x: "8%", y: "6%", w: "28%", h: "18%" },
    { x: "40%", y: "6%", w: "22%", h: "18%" },
    { x: "66%", y: "6%", w: "24%", h: "18%" },
    { x: "4%", y: "32%", w: "42%", h: "26%" },
    { x: "50%", y: "32%", w: "42%", h: "26%" },
    { x: "10%", y: "66%", w: "26%", h: "16%" },
    { x: "40%", y: "66%", w: "22%", h: "16%" },
    { x: "66%", y: "66%", w: "24%", h: "16%" },
  ] as const
  const browserBg2 = [
    { x: "8%", y: "4%", w: "62%", h: "20%" },
    { x: "74%", y: "28%", w: "8%", h: "12%", dot: true },
    { x: "4%", y: "36%", w: "8%", h: "12%", dot: true },
    { x: "22%", y: "30%", w: "56%", h: "16%" },
    { x: "16%", y: "54%", w: "66%", h: "18%" },
    { x: "74%", y: "56%", w: "8%", h: "12%", dot: true },
    { x: "34%", y: "78%", w: "44%", h: "14%" },
  ] as const

  return (
    <div ref={ref} className="relative mx-auto h-[26rem] max-w-4xl overflow-hidden">
      <SharedGraphicsStyles />
      <div
        className="graphics-browser-flow absolute left-1/2 top-1/2 h-[21.5rem] w-[94%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[0.9rem] border border-white/10 bg-[#101010]"
        style={{
          boxShadow:
            "0 18px 64px -42px rgba(0,0,0,0.96), inset 0 0 0 1px rgba(255,255,255,0.03)",
        }}
      >
        <div className="relative z-[2] flex h-14 items-center border-b border-white/8 bg-[#171717] px-4 md:px-5">
          <div className="absolute left-4 flex items-center gap-2 md:left-5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f35f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#f4c44e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#4fd56a]" />
          </div>
          <div className="mx-auto h-7 w-[40%] min-w-[16rem] max-w-[28rem] rounded-full border border-white/6 bg-[#232323]" />
        </div>
        <div className="relative z-[1] h-[calc(100%-3.5rem)] bg-[#0d1116]">
          <div className="absolute inset-x-[2.4%] top-[3.2%] bottom-[2.8%] overflow-hidden rounded-[0.7rem] border border-white/6 bg-black">
            <div
              className="absolute left-1/2 top-[72%] h-52 w-[82%] -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 38%, transparent) 0%, transparent 76%)",
                filter: "blur(38px)",
                opacity: 0.74,
              }}
            />

            <div
              className="graphics-browser-bg absolute inset-0"
              style={{ opacity: bg2Opacity }}
            >
              <div
                className="graphics-browser-scroll-field absolute inset-y-[-48%] inset-x-0"
                style={{ transform: `translateY(${scrollOffset}px)` }}
              >
                {[0, 1].map((row) => (
                  <div key={row} className="absolute inset-x-0 h-full" style={{ top: `${row * 100}%` }}>
                    {browserBg2.map((item, i) =>
                      "dot" in item && item.dot ? (
                        <div
                          key={`${row}-${i}`}
                          className="graphics-browser-dot absolute rounded-full border border-primary/30"
                          style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                        />
                      ) : (
                        <div
                          key={`${row}-${i}`}
                          className="graphics-browser-pill absolute rounded-2xl border border-primary/24"
                          style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                        >
                          <div className="absolute inset-x-[9%] top-[28%] h-[22%] rounded-[999px] border border-primary/28" />
                        </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div
              className="graphics-browser-bg absolute inset-0"
              style={{ opacity: bg1Opacity }}
            >
              <div
                className="graphics-browser-scroll-field absolute inset-y-[-48%] inset-x-0"
                style={{ transform: `translateY(${scrollOffset}px)` }}
              >
                {[0, 1].map((row) => (
                  <div key={row} className="absolute inset-x-0 h-full" style={{ top: `${row * 100}%` }}>
                    {browserBg1.map((item, i) => (
                      <div
                        key={`${row}-${i}`}
                        className="graphics-browser-card absolute rounded-[1.8rem] border border-primary/22"
                        style={{ left: item.x, top: item.y, width: item.w, height: item.h }}
                      >
                        <div className="absolute inset-x-[10%] top-[20%] h-[20%] rounded-[999px] border border-primary/28" />
                        <div className="absolute inset-x-[10%] bottom-[20%] h-[16%] rounded-[999px] border border-primary/18 opacity-80" />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function GraphicsStagingSection() {
  return (
    <section className="relative px-6 pb-28 pt-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <p className="text-[10px] font-medium uppercase tracking-[0.32em] text-primary/80">Graphics Staging</p>
          <h2 className="mt-4 text-2xl font-semibold text-foreground md:text-3xl">
            Temporary motion lab below pricing
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Three Code Wiki-inspired graphics staged here first in AVInt red, so we can refine motion, structure, and density before relocating them to their final positions.
          </p>
        </div>

        <div className="space-y-8">
          <StagingCard
            eyebrow="Graphic 01"
            title="Collapsing sheets into a box"
            description="Four flat elements collapse into a dimensional box as the section moves through the viewport."
          >
            <CollapseBoxGraphic />
          </StagingCard>

          <StagingCard
            eyebrow="Graphic 02"
            title="Floating cube over live system traces"
            description="A dimensional cube floats over streaming code-like rails and tightens as the section comes into view."
          >
            <FloatingCubeGraphic />
          </StagingCard>

          <StagingCard
            eyebrow="Graphic 03"
            title="Browser shell with analytic cube"
            description="A browser-like frame with a suspended cube that responds to scroll depth, ready for placement near guided flows or launch surfaces."
          >
            <BrowserCubeGraphic />
          </StagingCard>
        </div>
      </div>
    </section>
  )
}
