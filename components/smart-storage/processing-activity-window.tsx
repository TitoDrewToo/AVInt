"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import type { SmartStorageProcessingState } from "@/lib/smart-storage-cache"

type ProcessingActivityWindowProps = {
  isProcessing: boolean
  activeJobs: SmartStorageProcessingState["activeJobs"]
  receivedCount?: number
  isDeleting?: boolean
  deletingCount?: number
}

function stageForStatus(status: string | null) {
  switch (status) {
    case "uploaded":
      return "Queued"
    case "pending_scan":
    case "scanning":
      return "Scanning"
    case "processing":
      return "Processing"
    default:
      return "Working"
  }
}

function AnimatedStatus({ label }: { label: string }) {
  const [dots, setDots] = useState(3)

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduceMotion) return
    const timer = window.setInterval(() => setDots((current) => current === 3 ? 1 : current + 1), 420)
    return () => window.clearInterval(timer)
  }, [])

  return <span aria-label={`${label} in progress`}>{label}{".".repeat(dots)}</span>
}

function formatAge(createdAt: string | null) {
  if (!createdAt) return "just now"
  const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000))
  if (ageSeconds < 5) return "just now"
  if (ageSeconds < 60) return `${ageSeconds}s`
  return `${Math.floor(ageSeconds / 60)}m`
}

export function ProcessingActivityWindow({ isProcessing, activeJobs, receivedCount = 0, isDeleting = false, deletingCount = 0 }: ProcessingActivityWindowProps) {
  const hasActivity = isProcessing || isDeleting || activeJobs.length > 0
  const [isVisible, setIsVisible] = useState(hasActivity)
  const [renderJobs, setRenderJobs] = useState(activeJobs)

  useEffect(() => {
    if (hasActivity) {
      setIsVisible(true)
      return
    }

    const timer = window.setTimeout(() => setIsVisible(false), 360)
    return () => window.clearTimeout(timer)
  }, [hasActivity])

  useEffect(() => {
    if (activeJobs.length > 0) {
      setRenderJobs(activeJobs)
      return
    }
    if (isProcessing || isDeleting) {
      setRenderJobs([])
      return
    }

    const timer = window.setTimeout(() => setRenderJobs([]), 360)
    return () => window.clearTimeout(timer)
  }, [activeJobs, isProcessing, isDeleting])

  if (!isVisible && !hasActivity) return null

  const statsLabel = isDeleting ? `${deletingCount} removing` : !hasActivity ? "" : activeJobs.length > 0
    ? activeJobs.length === 1 && receivedCount === 1
      ? "1/1 in progress"
      : `${activeJobs.length} active`
    : receivedCount > 0
      ? `${receivedCount}/${receivedCount} in progress`
      : "Processing..."

  return (
    <section
      aria-label="Smart Storage processing activity"
      className={`glass-surface-sm mx-3 mb-3 overflow-hidden rounded-xl border border-border/70 transition-opacity duration-300 ease-out motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300 ${hasActivity ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            {isDeleting ? "File removal" : "Pipeline activity"}
          </span>
        </div>
        {statsLabel ? <span className="font-mono text-[10px] text-muted-foreground">{statsLabel}</span> : null}
      </div>

      <div className="space-y-1 px-3 py-2 font-mono text-[10px] leading-relaxed">
        {isDeleting && (
          <div className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
            <span className="text-primary motion-safe:animate-pulse" aria-hidden="true">›</span>
            <AnimatedStatus label="Removing selected files" />
          </div>
        )}
        {isProcessing && activeJobs.length === 0 && (
          <div className="flex items-center gap-2 text-muted-foreground" aria-live="polite">
            <span className="text-primary" aria-hidden="true">›</span>
            <span>Starting secure prescan…</span>
          </div>
        )}

        {renderJobs.length > 0 && (
          <div className="max-h-[3.75rem] space-y-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]" aria-live="polite">
            {renderJobs.map((job) => (
              <div key={`${job.fileId}-${job.created_at}`} className="flex min-w-0 items-center gap-3 text-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
                <span className="text-primary motion-safe:animate-pulse" aria-hidden="true">›</span>
                <span className="min-w-0 flex-1 truncate text-foreground/85">{job.filename}</span>
                <span className="w-[5.75rem] shrink-0 text-left text-primary/80">
                  {job.status !== "uploaded"
                    ? <AnimatedStatus label={stageForStatus(job.status)} />
                    : stageForStatus(job.status)}
                </span>
                <span className="w-8 shrink-0 text-right text-muted-foreground/70">{formatAge(job.created_at)}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </section>
  )
}
