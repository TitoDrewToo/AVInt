"use client"

import { AlertCircle, Check, Download, Loader2 } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { trackActivationEvent } from "@/lib/analytics"

type PdfReport = "tax-bundle" | "business-expense"

export function ReportPdfDownload({ report, dateFrom, dateTo, targetFolder }: { report: PdfReport; dateFrom?: string; dateTo?: string; targetFolder?: string }) {
  const [state, setState] = useState<"idle" | "working" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setState("working")
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")
      const response = await fetch(`/api/reports/${report}/pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dateFrom: dateFrom ?? "", dateTo: dateTo ?? "", targetFolder: targetFolder ?? "" }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error ?? "PDF export failed.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `${report}-report.pdf`
      anchor.click()
      URL.revokeObjectURL(url)
      trackActivationEvent("report_exported", { format: "pdf", report: report.replace("-", "_") })
      setState("success")
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF export failed.")
      setState("error")
    }
  }

  return <div className="flex items-center gap-2"><Button variant="outline" size="sm" className={`gap-2 rounded text-xs ${state === "working" ? "cw-ring-accent" : ""}`} onClick={() => void download()} disabled={state === "working"} aria-busy={state === "working"}>
    {state === "working" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state === "success" ? <Check className="h-3.5 w-3.5" /> : state === "error" ? <AlertCircle className="h-3.5 w-3.5 text-destructive" /> : <Download className="h-3.5 w-3.5" />}
    {state === "working" ? "Generating…" : state === "success" ? "PDF downloaded" : state === "error" ? "Retry PDF" : "Download PDF"}
  </Button>{error ? <span role="status" className="max-w-48 text-[10px] text-destructive">{error}</span> : null}</div>
}
