"use client"

import { AlertCircle, Check, Download, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { trackActivationEvent } from "@/lib/analytics"
import type { ReportKey } from "@/lib/report-document"

export const REPORT_EXPORT_FORMATS: Record<ReportKey, ("pdf" | "csv")[]> = {
  "tax-bundle": ["pdf", "csv"], "business-expense": ["pdf", "csv"], "profit-loss": ["pdf", "csv"], "income-summary": ["pdf", "csv"], "expense-summary": ["pdf", "csv"], "contract-summary": ["pdf"], "key-terms": ["pdf"],
}

export function ReportExportControls({ report, dateFrom = "", dateTo = "", targetFolder = "" }: { report: ReportKey; dateFrom?: string; dateTo?: string; targetFolder?: string }) {
  const [state, setState] = useState<"idle" | "working" | "success" | "error">("idle")
  const [format, setFormat] = useState<"pdf" | "csv">("pdf")
  const [error, setError] = useState<string | null>(null)
  async function download() {
    setState("working"); setError(null)
    try {
      const { data } = await supabase.auth.getSession(); const token = data.session?.access_token; if (!token) throw new Error("Unauthorized")
      const query = new URLSearchParams({ dateFrom, dateTo, targetFolder }).toString()
      const response = await fetch(`/api/reports/${report}/${format}?${query}`, { method: format === "pdf" ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(format === "pdf" ? { "Content-Type": "application/json" } : {}) }, ...(format === "pdf" ? { body: JSON.stringify({ dateFrom, dateTo, targetFolder }) } : {}) })
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error ?? "Export failed.") }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${report}-report.${format}`; anchor.click(); URL.revokeObjectURL(url)
      trackActivationEvent("report_exported", { format, report: report.replace("-", "_") }); setState("success")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); setState("error") }
  }
  return <div className="flex items-center gap-2 print:hidden"><select aria-label="Report export format" value={format} onChange={(event) => setFormat(event.target.value as "pdf" | "csv")} disabled={state === "working"} className="h-8 rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground">{REPORT_EXPORT_FORMATS[report].map((item) => <option key={item} value={item}>{item === "pdf" ? "PDF" : "Rows CSV"}</option>)}</select><Button variant="outline" size="sm" className={`gap-2 rounded text-xs ${state === "working" ? "cw-ring-accent" : ""}`} onClick={() => void download()} disabled={state === "working"} aria-busy={state === "working"}>{state === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "success" ? <Check className="h-3.5 w-3.5" /> : state === "error" ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : <Download className="h-3.5 w-3.5" />}{state === "working" ? "Generating…" : state === "success" ? "Downloaded" : state === "error" ? "Retry export" : "Download"}</Button>{error ? <span role="status" className="max-w-56 text-[10px] text-destructive">{error}</span> : null}</div>
}
