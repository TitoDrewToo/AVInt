"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

type PomelliClipProps = {
  name: "connect-drive" | "extract-data" | "automate-visibility" | "stop-hunting" | "mess-to-data" | "unlock-cloud" | "insight-ready"
  className?: string
  glow?: boolean
  rounded?: string
}

export function PomelliClip({ name, className, glow = true, rounded = "rounded-3xl" }: PomelliClipProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [])

  useEffect(() => {
    const el = videoRef.current
    if (!el || reducedMotion) return

    // Slow overall playback so the clip reads as a considered reveal, not a
    // quick loop. Combined with an early freeze below, this avoids the jarring
    // "pause mid-motion" effect that happens when we hold on the literal final
    // frame.
    const SLOW_RATE = 0.75
    // Freeze at 88% of duration. Pomelli clips tend to settle visually around
    // this point; the last ~12% is usually a micro-motion that looks unclean
    // when held. Holding earlier lands on a stable composition.
    const FREEZE_RATIO = 0.88

    const applyRate = () => {
      try { el.playbackRate = SLOW_RATE } catch {}
    }

    const onTimeUpdate = () => {
      if (!el.duration || isNaN(el.duration)) return
      if (el.currentTime >= el.duration * FREEZE_RATIO) {
        el.pause()
      }
    }

    el.addEventListener("loadedmetadata", applyRate)
    el.addEventListener("play", applyRate)
    el.addEventListener("timeupdate", onTimeUpdate)

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.currentTime = 0
            applyRate()
            el.play().catch(() => {})
          } else {
            el.pause()
          }
        }
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      el.removeEventListener("loadedmetadata", applyRate)
      el.removeEventListener("play", applyRate)
      el.removeEventListener("timeupdate", onTimeUpdate)
    }
  }, [reducedMotion])

  const base = `/pomelli/${name}`

  return (
    <div
      className={cn(
        "relative overflow-hidden glass-surface",
        rounded,
        glow && "retro-glow",
        className,
      )}
      style={{ aspectRatio: "9 / 16" }}
    >
      {reducedMotion ? (
        <img src={`${base}.jpg`} alt="" className="h-full w-full object-cover" />
      ) : (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="metadata"
          poster={`${base}.jpg`}
          className="h-full w-full object-cover"
        >
          <source src={`${base}.webm`} type="video/webm" />
          <source src={`${base}.mp4`} type="video/mp4" />
        </video>
      )}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 60%, oklch(0 0 0 / 0.25) 100%)",
        }}
      />
    </div>
  )
}
