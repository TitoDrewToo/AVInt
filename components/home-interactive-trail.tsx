"use client"

import { useEffect, useRef } from "react"

interface HomeInteractiveTrailProps {
  children: React.ReactNode
}

export function HomeInteractiveTrail({ children }: HomeInteractiveTrailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const setStaticAnchor = () => {
      const rect = container.getBoundingClientRect()
      const viewportHeight = window.innerHeight || 1
      const viewportCenterY = viewportHeight * 0.55
      const progress = rect.height > 0
        ? Math.min(0.82, Math.max(0.18, (viewportCenterY - rect.top) / rect.height))
        : 0.5

      container.style.setProperty("--trail-y", `${(progress * 100).toFixed(2)}%`)
    }

    setStaticAnchor()
    window.addEventListener("scroll", setStaticAnchor, { passive: true })
    window.addEventListener("resize", setStaticAnchor)

    return () => {
      window.removeEventListener("scroll", setStaticAnchor)
      window.removeEventListener("resize", setStaticAnchor)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative overflow-x-hidden" style={{ ["--trail-y" as string]: "38%" }}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-x-0 top-0 h-56"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--retro-glow-red) 12%, transparent) 0%, transparent 100%)",
            opacity: 0.85,
          }}
        />
        <div
          className="absolute inset-y-16 left-1/2 w-px -translate-x-1/2"
          style={{
            background: "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--retro-glow-red) 44%, transparent) 16%, color-mix(in oklab, var(--retro-glow-red) 36%, transparent) 84%, transparent 100%)",
            opacity: 0.3,
          }}
        />
        <div
          className="absolute left-1/2 h-[22rem] w-[22rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            top: "var(--trail-y)",
            opacity: 0.16,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 56%, transparent) 0%, transparent 70%)",
            filter: "blur(24px)",
          }}
        />
        <div
          className="absolute inset-x-[8%] top-[18%] h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--retro-glow-red) 22%, transparent) 22%, color-mix(in oklab, var(--retro-glow-red) 14%, transparent) 78%, transparent 100%)",
            opacity: 0.4,
          }}
        />
        <div
          className="absolute inset-x-[16%] top-[58%] h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--retro-glow-red) 18%, transparent) 16%, color-mix(in oklab, var(--retro-glow-red) 12%, transparent) 82%, transparent 100%)",
            opacity: 0.32,
          }}
        />
      </div>
      {children}
    </div>
  )
}
