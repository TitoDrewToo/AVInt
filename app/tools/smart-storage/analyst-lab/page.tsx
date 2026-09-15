"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowLeft, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { evaluateEodControls, profileDataQuality, type AnalystRow, type QualityRule } from "@/lib/analyst-workflows"

const sampleRows: AnalystRow[] = [
  { transaction_id: "TX-1001", business_date: "2026-09-14", status: "posted", amount: 12500, source: "ledger" },
  { transaction_id: "TX-1002", business_date: "2026-09-14", status: "posted", amount: 8900, source: "ledger" },
  { transaction_id: "TX-1002", business_date: "2026-09-14", status: "posted", amount: 8900, source: "ledger" },
  { transaction_id: "TX-1003", business_date: "2026-09-14", status: "pending", amount: -40, source: "ledger" },
]

const rules: QualityRule[] = [
  { kind: "required", field: "transaction_id" },
  { kind: "required", field: "business_date" },
  { kind: "allowed_values", field: "status", values: ["posted", "pending", "reversed"] },
  { kind: "numeric_range", field: "amount", min: 0 },
  { kind: "unique", field: "transaction_id" },
]

export default function AnalystLabPage() {
  const quality = useMemo(() => profileDataQuality(sampleRows, rules), [])
  const eod = useMemo(() => evaluateEodControls({ expectedRows: 3, actualRows: 4, expectedTotal: 21400, actualTotal: 30260, expectedFeeds: ["ledger", "settlement"], receivedFeeds: ["ledger"] }), [])
  return <div className="min-h-screen bg-background text-foreground"><Navbar wide /><main className="mx-auto max-w-6xl px-5 py-10">
    <Link href="/tools/smart-storage" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Smart Storage</Link>
    <div className="mt-8 max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Analyst workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Quality checks before the report</h1><p className="mt-3 text-base leading-7 text-muted-foreground">A compact control layer for reconciliation, data-quality investigation, and end-of-day checks. It names the rows and feeds that need attention before a conclusion is written.</p></div>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Data quality profile</p><h2 className="mt-1 text-xl font-semibold">{quality.score * 100}% clean</h2></div><ClipboardCheck className="h-5 w-5 text-primary" /></div><p className="mt-3 text-sm text-muted-foreground">{quality.findings.length} findings across {quality.rowCount} rows · {quality.cleanRows} clean rows. Missing: {quality.summary.missingRequired}; invalid: {quality.summary.invalidValues}; range: {quality.summary.outOfRange}; duplicates: {quality.summary.duplicates}.</p><div className="mt-5 space-y-2">{quality.findings.map((finding) => <div key={`${finding.classification}-${finding.rowIndex}-${finding.field}`} className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950"><span className="font-medium">Row {finding.rowIndex + 1} · {finding.classification.replaceAll("_", " ")}</span>{finding.field ? ` · ${finding.field}` : ""}{finding.message ? ` — ${finding.message}` : ""}</div>)}</div></section>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">EOD control</p><h2 className="mt-1 text-xl font-semibold">{eod.status === "clear" ? "Clear to report" : "Control breaks found"}</h2></div>{eod.status === "clear" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}</div><p className="mt-3 text-sm text-muted-foreground">{eod.findings.length ? `${eod.findings.length} control checks need review before sign-off.` : "All configured control checks passed."}</p><div className="mt-5 space-y-2">{eod.findings.map((finding) => <div key={finding} className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950">{finding}</div>)}</div></section>
    </div>
    <p className="mt-8 text-xs text-muted-foreground">This lab uses synthetic rows. Connect it to a saved reconciliation or report definition once the workflow is approved for production use.</p>
  </main></div>
}
