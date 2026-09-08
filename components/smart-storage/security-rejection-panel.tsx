"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, RotateCcw, ShieldAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"

type SecurityNotice = {
  id: string
  file_id: string
  outcome: "quarantined" | "rejected" | "scan_failed"
  reason_code: string
  safe_reason: string
  created_at: string
  files: { filename: string } | Array<{ filename: string }> | null
}

function filenameFor(notice: SecurityNotice) {
  if (Array.isArray(notice.files)) return notice.files[0]?.filename ?? "Unnamed file"
  return notice.files?.filename ?? "Unnamed file"
}

function outcomeLabel(outcome: SecurityNotice["outcome"]) {
  if (outcome === "quarantined") return "Quarantined"
  if (outcome === "rejected") return "Rejected"
  return "Retry required"
}

export function SecurityRejectionPanel({
  accountId,
  refreshKey,
  onRetry,
}: {
  accountId: string | null
  refreshKey: string
  onRetry?: (fileId: string) => void
}) {
  const [notices, setNotices] = useState<SecurityNotice[]>([])

  const loadNotices = useCallback(async () => {
    if (!accountId) {
      setNotices([])
      return
    }
    const { data, error } = await supabase
      .from("prescan_rejection_notices")
      .select("id, file_id, outcome, reason_code, safe_reason, created_at, files(filename)")
      .eq("account_id", accountId)
      .is("dismissed_at", null)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) {
      console.error("prescan rejection notices failed:", error.message)
      return
    }
    setNotices((data ?? []) as SecurityNotice[])
  }, [accountId])

  useEffect(() => {
    void loadNotices()
  }, [loadNotices, refreshKey])

  const dismiss = async () => {
    const ids = notices.map((notice) => notice.id)
    if (ids.length === 0) return
    const dismissedAt = new Date().toISOString()
    const { error } = await supabase
      .from("prescan_rejection_notices")
      .update({ dismissed_at: dismissedAt })
      .eq("account_id", accountId)
      .in("id", ids)
    if (error) {
      console.error("prescan notice dismissal failed:", error.message)
      return
    }
    setNotices([])
  }

  if (notices.length === 0) return null

  const quarantineCount = notices.filter((notice) => notice.outcome === "quarantined").length
  const rejectedCount = notices.filter((notice) => notice.outcome === "rejected").length
  const retryCount = notices.filter((notice) => notice.outcome === "scan_failed").length

  return (
    <section aria-label="Upload security notices" className="mx-3 mb-3 overflow-hidden rounded-xl border border-amber-300/70 bg-amber-50/70 text-amber-950 shadow-sm dark:border-amber-900/70 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="flex items-start justify-between gap-3 border-b border-amber-300/60 px-3 py-2 dark:border-amber-900/60">
        <div className="flex min-w-0 items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Some files need attention</p>
            <p className="mt-0.5 text-xs opacity-75">
              {[
                quarantineCount ? `${quarantineCount} quarantined` : "",
                rejectedCount ? `${rejectedCount} rejected` : "",
                retryCount ? `${retryCount} retry required` : "",
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => void dismiss()} className="rounded p-1 opacity-65 transition hover:bg-amber-200/60 hover:opacity-100 dark:hover:bg-amber-900/60" aria-label="Dismiss upload security notices" title="Dismiss these notices">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="max-h-52 divide-y divide-amber-300/50 overflow-y-auto dark:divide-amber-900/50">
        {notices.map((notice) => (
          <div key={notice.id} className="flex items-start gap-3 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="max-w-full truncate text-xs font-medium" title={filenameFor(notice)}>{filenameFor(notice)}</span>
                <span className="rounded-full border border-current/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide opacity-75">{outcomeLabel(notice.outcome)}</span>
                <time className="text-[10px] opacity-60" dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleString()}</time>
              </div>
              <p className="mt-1 text-xs leading-relaxed opacity-80">{notice.safe_reason}</p>
              <p className="mt-1 text-[10px] opacity-60">
                {notice.outcome === "scan_failed" ? "Retry the security check. Processing remains blocked until it passes." : "Replace or remove this file. It was not sent for processing."}
              </p>
            </div>
            {notice.outcome === "scan_failed" && onRetry ? (
              <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 border-current/25 bg-transparent px-2 text-[10px]" onClick={() => onRetry(notice.file_id)} title="Retry this file's security check">
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" /> Retry
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}
