"use client"

import { Activity, CheckCircle2, CircleAlert, Loader2 } from "lucide-react"

import type { SmartStorageProcessingState } from "@/lib/smart-storage-cache"

type ProcessingActivityWindowProps = {
  isProcessing: boolean
  activeJobs: SmartStorageProcessingState["activeJobs"]
  attentionCount?: number
}

function stageForStatus(status: string | null) {
  switch (status) {
    case "uploaded":
      return "queued"
    case "pending_scan":
    case "scanning":
      return "scanning"
    case "processing":
      return "extracting + normalizing"
    default:
      return "working"
  }
}

function formatAge(createdAt: string | null) {
  if (!createdAt) return "just now"
  const ageSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / 1000))
  if (ageSeconds < 5) return "just now"
  if (ageSeconds < 60) return `${ageSeconds}s`
  return `${Math.floor(ageSeconds / 60)}m`
}

export function ProcessingActivityWindow({ isProcessing, activeJobs, attentionCount = 0 }: ProcessingActivityWindowProps) {
  if (!isProcessing && attentionCount === 0) return null

  const visibleJobs = activeJobs.slice(0, 3)

  return (
    <section
      aria-label="Smart Storage processing activity"
      className="glass-surface-sm mx-3 mb-3 overflow-hidden rounded-xl border border-border/70"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isProcessing ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <Activity className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
            {isProcessing ? "Pipeline activity" : "Attention required"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {isProcessing ? `${activeJobs.length} active` : `${attentionCount} item${attentionCount === 1 ? "" : "s"}`}
        </span>
      </div>

      <div className="space-y-1 px-3 py-2 font-mono text-[10px] leading-relaxed">
        {visibleJobs.map((job) => (
          <div key={`${job.fileId}-${job.created_at}`} className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className="text-primary" aria-hidden="true">›</span>
            <span className="min-w-0 flex-1 truncate text-foreground/85">{job.filename}</span>
            <span className="shrink-0 text-primary/80">{stageForStatus(job.status)}</span>
            <span className="shrink-0 text-muted-foreground/70">{formatAge(job.created_at)}</span>
          </div>
        ))}

        {attentionCount > 0 && (
          <div className="flex items-center gap-2 pt-1 text-amber-700 dark:text-amber-300">
            <CircleAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{attentionCount} file{attentionCount === 1 ? "" : "s"} need review before dashboard use</span>
          </div>
        )}

        {!isProcessing && attentionCount === 0 && (
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>All current files are ready</span>
          </div>
        )}
      </div>
    </section>
  )
}
