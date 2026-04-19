"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import type { Session } from "@supabase/supabase-js"
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FolderOpen,
  Printer,
} from "lucide-react"

import { AuthGuardModal } from "@/components/auth-guard-modal"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { useEntitlement } from "@/hooks/use-entitlement"
import { supabase } from "@/lib/supabase"
import {
  computeTaxBundle,
  generateEmployedTaxBundleCSV,
  type TaxRow,
} from "@/lib/tax-bundle"

interface FolderOption { id: string; name: string }

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return "-"
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function safeNum(v: unknown): number {
  const n = parseFloat(String(v ?? "0"))
  return isNaN(n) ? 0 : n
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export default function EmployedTaxBundlePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro } = useEntitlement(session)
  const [rows, setRows] = useState<TaxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState("")
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  const [totalOwnedDocs, setTotalOwnedDocs] = useState<number | null>(null)
  const [detectedYears, setDetectedYears] = useState<number[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setSessionLoaded(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from("folders").select("id, name").eq("user_id", session.user.id).order("name")
      .then(({ data }) => { if (data) setFolders(data) })
  }, [session])

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    setRows([])
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")

      const params = new URLSearchParams()
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (targetFolder) params.set("targetFolder", targetFolder)

      const res = await fetch(`/api/reports/tax-bundle?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load employee tax data.")

      const nextRows = Array.isArray(json.rows) ? json.rows : []
      setRows(nextRows.map((row: any) => ({
        file_id:                  row.file_id,
        filename:                 row.files?.filename ?? "unknown",
        document_type:            row.files?.document_type ?? "unknown",
        vendor_name:              row.vendor_name,
        vendor_normalized:        row.vendor_normalized,
        employer_name:            row.employer_name,
        document_date:            row.document_date,
        period_start:             row.period_start,
        period_end:               row.period_end,
        total_amount:             row.total_amount != null ? safeNum(row.total_amount) : null,
        gross_income:             row.gross_income != null ? safeNum(row.gross_income) : null,
        net_income:               row.net_income != null ? safeNum(row.net_income) : null,
        expense_category:         row.expense_category,
        income_source:            row.income_source,
        classification_rationale: row.classification_rationale,
        jurisdiction:             row.jurisdiction,
        currency:                 row.currency,
        confidence_score:         row.confidence_score != null ? safeNum(row.confidence_score) : null,
        storage_path:             row.files?.storage_path ?? null,
      })))
      setTotalOwnedDocs(typeof json.totalOwnedDocs === "number" ? json.totalOwnedDocs : 0)

      const years = Array.isArray(json.detectedYears)
        ? json.detectedYears.filter((n: unknown) => typeof n === "number" && !isNaN(n))
        : []
      setDetectedYears(years)

      if (!defaultsApplied && years.length > 0 && !dateFrom && !dateTo) {
        const y = years[0]
        setDateFrom(`${y}-01-01`)
        setDateTo(`${y}-12-31`)
      }
      setDefaultsApplied(true)
    } catch (err) {
      console.error("loadEmployeeTaxData error:", err)
      setError("Failed to load employee tax data. Please try again.")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadData() }, [loadData])

  const summary = useMemo(() => computeTaxBundle(rows), [rows])
  const {
    primaryCurrency: currency,
    currencies,
    mixedCurrency,
    wageRows,
    wageGross,
    wageNet,
    wagePayrollDeductions,
    selfEmploymentGross,
    otherIncomeGross,
  } = summary

  const employerRows = useMemo(() => {
    const map = new Map<string, { employer: string; gross: number; net: number; deductions: number; docs: number }>()
    for (const row of wageRows) {
      const employer = row.employer_name ?? row.vendor_name ?? "Unknown Employer"
      const gross = row.gross_income ?? row.total_amount ?? 0
      const net = row.net_income ?? 0
      const deductions = row.gross_income != null && row.net_income != null
        ? Math.max(0, gross - net)
        : 0
      const existing = map.get(employer) ?? { employer, gross: 0, net: 0, deductions: 0, docs: 0 }
      map.set(employer, {
        employer,
        gross: existing.gross + gross,
        net: existing.net + net,
        deductions: existing.deductions + deductions,
        docs: existing.docs + 1,
      })
    }
    return Array.from(map.values()).sort((a, b) => b.gross - a.gross)
  }, [wageRows])

  const payPeriodRows = [...wageRows].sort((a, b) =>
    (b.period_end ?? b.document_date ?? "").localeCompare(a.period_end ?? a.document_date ?? "")
  )
  const rowsMissingNet = wageRows.filter(row => row.gross_income == null || row.net_income == null).length
  const rowsMissingEmployer = wageRows.filter(row => !row.employer_name && !row.vendor_name).length
  const rowsMissingDates = wageRows.filter(row => !row.period_end && !row.document_date).length
  const netPayRate = wageGross > 0 ? wageNet / wageGross : 0
  const deductionRate = wageGross > 0 ? wagePayrollDeductions / wageGross : 0
  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })
  const matchedDocCount = rows.length
  const hasAnyFilter = Boolean(dateFrom || dateTo || targetFolder)
  const ownsNoDocs = totalOwnedDocs === 0
  const folderExcludingEverything = hasAnyFilter && wageRows.length === 0 && !!targetFolder
  const hasNonWageIncome = selfEmploymentGross > 0 || otherIncomeGross > 0
  const taxYear = wageRows.map(r => r.period_end ?? r.document_date).filter(Boolean).length
    ? new Set(wageRows.map(r => r.period_end ?? r.document_date).filter(Boolean).map(d => d!.slice(0, 4))).size === 1
      ? wageRows.map(r => r.period_end ?? r.document_date).filter(Boolean)[0]!.slice(0, 4)
      : "Multiple years"
    : "-"

  const applyTaxYear = (year: number) => {
    setDateFrom(`${year}-01-01`)
    setDateTo(`${year}-12-31`)
  }
  const applyLastQuarter = () => {
    const now = new Date()
    const currentQ = Math.floor(now.getMonth() / 3)
    const lastQ = currentQ === 0 ? 3 : currentQ - 1
    const year = currentQ === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const startMonth = lastQ * 3
    setDateFrom(toISO(new Date(year, startMonth, 1)))
    setDateTo(toISO(new Date(year, startMonth + 3, 0)))
  }
  const clearPeriod = () => { setDateFrom(""); setDateTo("") }
  const activePreset = (() => {
    if (!dateFrom && !dateTo) return "all"
    for (const y of detectedYears) {
      if (dateFrom === `${y}-01-01` && dateTo === `${y}-12-31`) return `ty-${y}`
    }
    return null
  })()

  function downloadCSV() {
    const blob = new Blob([generateEmployedTaxBundleCSV(summary)], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `employee-income-tax-bundle-${taxYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />
  if (!isPro) return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-lg font-semibold text-foreground">Pro Required</p>
          <p className="text-sm text-muted-foreground">Upgrade to access financial reports.</p>
          <a href="/pricing" className="inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">View Pricing</a>
        </div>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 flex items-center gap-3">
            <Link href="/tools/smart-storage">
              <button className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <span className="text-xs text-muted-foreground">Smart Storage / Reports / Tax Bundle</span>
          </div>

          <div className="mb-8 space-y-3 print:hidden">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Period</span>
              {detectedYears.slice(0, 3).map(y => (
                <button key={y} onClick={() => applyTaxYear(y)}
                  className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                    activePreset === `ty-${y}`
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}>
                  Tax Year {y}
                </button>
              ))}
              <button onClick={applyLastQuarter}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Last Quarter
              </button>
              <button onClick={clearPeriod}
                className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                  activePreset === "all"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                All Time
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
              <span className="text-xs text-muted-foreground">-</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                Showing <span className="font-semibold text-foreground">{matchedDocCount}</span>
                {" "}document{matchedDocCount === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground/40">/</span>
              <span>
                Period <span className="font-mono text-foreground/80">{dateFrom || "-"} to {dateTo || "-"}</span>
              </span>
              {targetFolder && (
                <>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px]">
                    <FolderOpen className="h-3 w-3" />
                    {folders.find(f => f.id === targetFolder)?.name ?? "folder"}
                    <button onClick={() => setTargetFolder("")} className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label="Clear folder filter">x</button>
                  </span>
                </>
              )}
            </div>

            {folders.length > 0 && !targetFolder && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="italic">Optional - narrow to a folder if the auto-filter is picking up unrelated data:</span>
                <div className="relative">
                  <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={targetFolder}
                    onChange={e => setTargetFolder(e.target.value)}
                    className="appearance-none rounded border border-border bg-background py-1 pl-7 pr-6 text-[11px] text-foreground"
                  >
                    <option value="">Choose folder...</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-xs uppercase tracking-widest text-muted-foreground">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-32 text-xs text-red-500">
              {error}
            </div>
          ) : wageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <p className="text-sm font-medium text-foreground">
                {ownsNoDocs ? "No documents yet" : folderExcludingEverything ? "Folder filter is excluding wage documents" : "No wage documents in this period"}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Upload payslips or W-2-like wage documents to build an employee income worksheet.
                This report intentionally excludes Schedule C business activity.
              </p>
              <div className="mt-2 flex gap-2">
                <Link href="/tools/smart-storage">
                  <button className="rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                    Go to Smart Storage
                  </button>
                </Link>
                {!ownsNoDocs && (
                  <button onClick={clearPeriod} className="rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                    All Time
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-10">
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Tax Bundle - Employee Income</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Tax Period: {taxYear}</span>
                      <span className="text-muted-foreground/30">/</span>
                      <span>Generated {generatedDate}</span>
                    </div>
                    <p className="mt-2 max-w-2xl text-[10px] leading-relaxed text-muted-foreground/60">
                      Wage and payslip worksheet for Form 1040 wage context. This is not a W-2 substitute,
                      not withholding verification, and not a Schedule C deduction report.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={downloadCSV} disabled={mixedCurrency} title={mixedCurrency ? "Disabled while mixed currencies are present" : undefined}>
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={() => window.print()}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded border border-border/60 bg-muted/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  What this report is
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                  An employee-income worksheet built from wage and payslip documents. It summarizes gross pay,
                  documented net pay, and the gross-minus-net difference as payroll deductions for review.
                  The deduction number is informational only and should not be treated as verified federal,
                  state, Social Security, Medicare, or local withholding.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                  Business income and Schedule C expenses belong in the Self-Employed Tax Bundle. This report
                  does not offset expenses against wages and does not replace official W-2 or 1099 forms.
                </p>
              </div>

              {(mixedCurrency || hasNonWageIncome || rowsMissingNet > 0 || rowsMissingEmployer > 0 || rowsMissingDates > 0) && (
                <div className="space-y-3">
                  {mixedCurrency && (
                    <div className="flex items-start gap-3 rounded border border-red-500/30 bg-red-500/5 p-4">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <p className="text-xs text-muted-foreground">
                        Mixed currencies detected ({currencies.join(", ")}). Convert to a single currency before using totals.
                      </p>
                    </div>
                  )}
                  {hasNonWageIncome && (
                    <div className="flex items-start gap-3 rounded border border-yellow-500/30 bg-yellow-500/5 p-4">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                      <p className="text-xs text-muted-foreground">
                        Non-wage income exists in this period. It is excluded here; use the Self-Employed Tax Bundle or Income Summary for those documents.
                      </p>
                    </div>
                  )}
                  {(rowsMissingNet > 0 || rowsMissingEmployer > 0 || rowsMissingDates > 0) && (
                    <div className="flex items-start gap-3 rounded border border-yellow-500/30 bg-yellow-500/5 p-4">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                      <p className="text-xs text-muted-foreground">
                        Review data quality: {rowsMissingNet} document{rowsMissingNet === 1 ? "" : "s"} missing gross or net pay,
                        {" "}{rowsMissingEmployer} missing employer, and {rowsMissingDates} missing pay-period/date coverage.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Employee Wage Summary
                </p>
                <div className="grid grid-cols-1 divide-y divide-border rounded border border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
                  {[
                    { label: "Gross Wage Income", value: fmt(wageGross, currency) },
                    { label: "Net Pay Documented", value: fmt(wageNet, currency) },
                    { label: "Payroll Deductions", value: fmt(wagePayrollDeductions, currency) },
                    { label: "Deduction Rate", value: `${(deductionRate * 100).toFixed(1)}%` },
                  ].map(item => (
                    <div key={item.label} className="px-5 py-4">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                      <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-foreground">{item.value}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                  Documented net pay rate: {(netPayRate * 100).toFixed(1)}%. Payroll deductions are calculated as gross pay minus net pay when both values exist.
                </p>
              </div>

              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Employer Breakdown
                </p>
                <div className="rounded border border-border p-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Employer</th>
                        <th className="pb-2 text-right font-medium">Gross</th>
                        <th className="pb-2 text-right font-medium">Net</th>
                        <th className="pb-2 text-right font-medium">Deductions</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {employerRows.map(row => (
                        <tr key={row.employer}>
                          <td className="py-2 text-foreground">{row.employer}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-foreground">{fmt(row.gross, currency)}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-foreground">{fmt(row.net, currency)}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{fmt(row.deductions, currency)}</td>
                          <td className="py-2 text-right text-muted-foreground">{row.docs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Payslip Audit Trail
                </p>
                <div className="overflow-hidden rounded border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="p-3 font-medium">Source File</th>
                        <th className="p-3 font-medium">Employer</th>
                        <th className="p-3 font-medium">Period</th>
                        <th className="p-3 text-right font-medium">Gross</th>
                        <th className="p-3 text-right font-medium">Net</th>
                        <th className="p-3 text-right font-medium">Deductions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {payPeriodRows.map(row => {
                        const gross = row.gross_income ?? row.total_amount ?? 0
                        const net = row.net_income ?? 0
                        const deductions = row.gross_income != null && row.net_income != null
                          ? Math.max(0, gross - net)
                          : 0
                        return (
                          <tr key={row.file_id}>
                            <td className="max-w-[160px] truncate p-3 text-muted-foreground" title={row.filename}>{row.filename}</td>
                            <td className="p-3 text-foreground">{row.employer_name ?? row.vendor_name ?? "Unknown Employer"}</td>
                            <td className="p-3 text-muted-foreground">
                              {row.period_start || row.period_end
                                ? `${formatDate(row.period_start)} - ${formatDate(row.period_end)}`
                                : formatDate(row.document_date)}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums text-foreground">{fmt(gross, currency)}</td>
                            <td className="p-3 text-right font-mono tabular-nums text-foreground">{fmt(net, currency)}</td>
                            <td className="p-3 text-right font-mono tabular-nums text-muted-foreground">{fmt(deductions, currency)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  This employee report summarizes wage records extracted from uploaded payslips and similar documents.
                  It is not tax advice, not an official filing document, and not a substitute for Form W-2, Form 1099,
                  employer payroll records, or tax software. Payroll deductions are the documented gross-minus-net
                  difference only; they are not verified withholding by tax authority or benefit type. Always consult
                  a licensed tax professional before filing.
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
