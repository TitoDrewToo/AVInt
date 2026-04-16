"use client"

import { useEffect, useRef, useState } from "react"

interface HomeInteractiveTrailProps {
  children: React.ReactNode
}

export function HomeInteractiveTrail({ children }: HomeInteractiveTrailProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const frameRef = useRef<number | null>(null)
  const targetRef = useRef({ x: 0.5, y: 0.2, visible: 0 })
  const currentRef = useRef({ x: 0.5, y: 0.2, visible: 0 })
  const [style, setStyle] = useState({
    x: "50%",
    y: "20%",
    opacity: 0,
    aura: 0.18,
  })

  useEffect(() => {
    const updateTarget = () => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const viewportHeight = window.innerHeight || 1
      const viewportCenterY = viewportHeight * 0.55
      const progress = rect.height > 0
        ? Math.min(1, Math.max(0, (viewportCenterY - rect.top) / rect.height))
        : 0

      if (targetRef.current.visible === 0) {
        targetRef.current.x = 0.5
        targetRef.current.y = progress
      }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const insideX = event.clientX >= rect.left && event.clientX <= rect.right
      const insideY = event.clientY >= rect.top && event.clientY <= rect.bottom

      if (insideX && insideY) {
        targetRef.current.x = Math.min(0.88, Math.max(0.12, (event.clientX - rect.left) / rect.width))
        targetRef.current.y = Math.min(0.95, Math.max(0.05, (event.clientY - rect.top) / rect.height))
        targetRef.current.visible = 1
      } else {
        targetRef.current.visible = 0
        updateTarget()
      }
    }

    const handlePointerLeave = () => {
      targetRef.current.visible = 0
      updateTarget()
    }

    const handleScroll = () => {
      updateTarget()
    }

    const animate = () => {
      const current = currentRef.current
      const target = targetRef.current

      current.x += (target.x - current.x) * 0.085
      current.y += (target.y - current.y) * 0.085
      current.visible += (target.visible - current.visible) * 0.075

      setStyle({
        x: `${(current.x * 100).toFixed(2)}%`,
        y: `${(current.y * 100).toFixed(2)}%`,
        opacity: current.visible * 0.7 + 0.16,
        aura: current.visible * 0.25 + 0.18,
      })

      frameRef.current = window.requestAnimationFrame(animate)
    }

    updateTarget()
    frameRef.current = window.requestAnimationFrame(animate)
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerleave", handlePointerLeave)
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll)

    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerleave", handlePointerLeave)
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-y-16 left-1/2 w-px -translate-x-1/2"
          style={{
            background: "linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--retro-glow-red) 44%, transparent) 16%, color-mix(in oklab, var(--retro-glow-red) 36%, transparent) 84%, transparent 100%)",
            opacity: 0.3,
          }}
        />
        <div
          className="absolute h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: style.x,
            top: style.y,
            opacity: style.opacity,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 62%, white) 0%, color-mix(in oklab, var(--retro-glow-red) 42%, transparent) 26%, transparent 68%)",
            filter: "blur(30px)",
          }}
        />
        <div
          className="absolute h-[18rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left: style.x,
            top: style.y,
            opacity: style.aura,
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 80%, white) 0%, transparent 72%)",
            filter: "blur(8px)",
          }}
        />
      </div>
      {children}
    </div>
  )
}
