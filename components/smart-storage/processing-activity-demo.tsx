"use client"

import { useState } from "react"
import { ProcessingActivityWindow } from "@/components/smart-storage/processing-activity-window"
import type { SmartStorageProcessingState } from "@/lib/smart-storage-cache"

type DemoMode = "one" | "two" | "queue"

const now = Date.now()
const jobs: SmartStorageProcessingState["activeJobs"] = [
  { fileId: "demo-receipt", filename: "march-receipt.pdf", status: "scanning", created_at: new Date(now - 12_000).toISOString() },
  { fileId: "demo-invoice", filename: "supplier-invoice.pdf", status: "processing", created_at: new Date(now - 48_000).toISOString() },
  { fileId: "demo-statement", filename: "june-statement.pdf", status: "scanning", created_at: new Date(now - 21_000).toISOString() },
  { fileId: "demo-contract", filename: "vendor-contract.pdf", status: "processing", created_at: new Date(now - 31_000).toISOString() },
  { fileId: "demo-export", filename: "sales-export.csv", status: "scanning", created_at: new Date(now - 42_000).toISOString() },
]

export function ProcessingActivityDemo() {
  const [mode, setMode] = useState<DemoMode>("one")
  const count = mode === "one" ? 1 : mode === "two" ? 2 : jobs.length
  const activeJobs = jobs.slice(0, count)

  return <div className="space-y-6">
    <div className="glass-surface rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground"><strong className="text-foreground">Local preview only.</strong> This fixture does not upload files or contact Supabase. It exercises the same window used by Smart Storage.</div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Processing window demo states">
      {(["one", "two", "queue"] as DemoMode[]).map((item) => <button key={item} type="button" onClick={() => setMode(item)} className={`rounded-xl border px-3 py-2 text-xs font-medium capitalize transition-colors ${mode === item ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>{item === "queue" ? "Queue (5)" : `${item} file`}</button>)}
    </div>
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/45">
      <ProcessingActivityWindow isProcessing activeJobs={activeJobs} receivedCount={count} />
    </div>
  </div>
}
