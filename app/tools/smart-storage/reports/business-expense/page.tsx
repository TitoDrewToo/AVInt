"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import {
  BUSINESS_EXPENSE_SCOPE,
  getBusinessExpenseEffectiveRate,
  getDefaultBusinessExpenseAssumptions,
  normalizeBusinessExpenseAssumptions,
  type BusinessExpenseAssumptions,
} from "@/lib/report-assumptions"
import { summarizeCurrencies } from "@/lib/report-utils"
import { ALL_SC_CATEGORIES, getScheduleCLine } from "@/lib/tax-bundle"
import type { Session } from "@supabase/supabase-js"
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Download, FolderOpen, Printer, Copy, Ban, FileWarning, Loader2 } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

// ── Constants ──────────────────────────────────────────────────────────────────

interface FolderOption { id: string; name: string }

const BUSINESS_CATEGORIES = new Set(ALL_SC_CATEGORIES)

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

// ── Types ──────────────────────────────────────────────────────────────────────

interface BizExpenseRow {
  id: string
  filename: string
  document_type: string
  vendor_name: string | null
  document_date: string | null
  total_amount: number | null
  currency: string | null
  expense_category: string | null
  payment_method: string | null
  tax_amount: number | null
  confidence_score: number | null
  isBusiness: boolean
}

interface DuplicateGroup { key: string; items: BizExpenseRow[] }

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "\u2026" : str
}

// ── Component ──────────────────────────────────────────────────────────────────

function BusinessExpenseContent() {
  const searchParams = useSearchParams()
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro }               = useEntitlement(session)
  const [expenses, setExpenses]           = useState<BizExpenseRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [dateFrom, setDateFrom]           = useState(searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo]               = useState(searchParams.get("dateTo") ?? "")
  const [folders, setFolders]             = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder]   = useState(searchParams.get("targetFolder") ?? "")
  // overrides: id → true (force Business) | false (force Personal)
  const [overrides, setOverrides]         = useState<Record<string, boolean>>({})
  const [csvCopied, setCsvCopied]         = useState(false)
  const [assumptions, setAssumptions]     = useState<BusinessExpenseAssumptions>(getDefaultBusinessExpenseAssumptions())
  const [assumptionsLoaded, setAssumptionsLoaded] = useState(false)
  const [savingAssumptions, setSavingAssumptions] = useState(false)
  const [assumptionsDirty, setAssumptionsDirty]   = useState(false)
  const [assumptionsOpen, setAssumptionsOpen]     = useState(false)

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

  useEffect(() => {
    if (!session?.user?.id) return
    let cancelled = false

    ;(async () => {
      try {
        const { data: auth } = await supabase.auth.getSession()
        const token = auth.session?.access_token
        if (!token) return

        const res = await fetch(`/api/report-assumptions?scope=${BUSINESS_EXPENSE_SCOPE}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error ?? "Failed to load assumptions")
        if (cancelled) return
        setAssumptions(normalizeBusinessExpenseAssumptions(json.assumptions))
        setAssumptionsLoaded(true)
        setAssumptionsDirty(false)
      } catch (err) {
        console.error("load assumptions error:", err)
        if (cancelled) return
        setAssumptions(getDefaultBusinessExpenseAssumptions())
        setAssumptionsLoaded(true)
      }
    })()

    return () => { cancelled = true }
  }, [session])

  const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

  const loadExpenses = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    setExpenses([])
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")

      const params = new URLSearchParams()
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (targetFolder) params.set("targetFolder", targetFolder)

      const res = await fetch(`/api/reports/business-expense?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load expense data.")

      const rows = Array.isArray(json.expenses) ? json.expenses : []
      setExpenses(rows.map((row: any, i: number) => {
        const expense_category = row.expense_category ?? null
        return {
          id:               row.file_id ?? String(i),
          filename:         row.files?.filename ?? "unknown",
          document_type:    row.files?.document_type ?? "unknown",
          vendor_name:      row.vendor_name,
          document_date:    row.document_date,
          total_amount:     safeNum(row.total_amount),
          currency:         row.currency,
          expense_category,
          payment_method:   row.payment_method,
          tax_amount:       row.tax_amount != null ? safeNum(row.tax_amount) : null,
          confidence_score: row.confidence_score,
          isBusiness:       BUSINESS_CATEGORIES.has(expense_category ?? ""),
        }
      }))
    } catch (err) {
      console.error("loadExpenses error:", err)
      setError("Failed to load expense data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  function toggle(id: string, current: boolean) {
    setOverrides(prev => {
      const next = { ...prev }
      if (id in next) {
        delete next[id]
      } else {
        next[id] = !current
      }
      return next
    })
  }

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const { primaryCurrency: currency, currencies, mixedCurrency } = summarizeCurrencies(expenses)

  const resolvedExpenses = expenses.map(e => ({
    ...e,
    isBusiness: e.id in overrides ? overrides[e.id] : e.isBusiness,
  }))

  const businessRows = resolvedExpenses.filter(e => e.isBusiness)
  const personalRows = resolvedExpenses.filter(e => !e.isBusiness)

  const totalBusiness = businessRows.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const totalPersonal = personalRows.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const totalAll      = totalBusiness + totalPersonal
  const businessPct   = totalAll > 0 ? (totalBusiness / totalAll) * 100 : 0
  const effectiveTaxRate = getBusinessExpenseEffectiveRate(assumptions)
  const estimatedTaxImpact = totalBusiness * (effectiveTaxRate / 100)

  const groupByCategory = (rows: BizExpenseRow[]) =>
    Object.values(
      rows.reduce((acc: Record<string, { category: string; total: number; count: number }>, row) => {
        const cat = row.expense_category ?? "Uncategorized"
        if (!acc[cat]) acc[cat] = { category: cat, total: 0, count: 0 }
        acc[cat].total += row.total_amount ?? 0
        acc[cat].count += 1
        return acc
      }, {})
    ).sort((a, b) => b.total - a.total)

  const businessByCategory = groupByCategory(businessRows)

  // Top vendors by business spend
  const vendorMap: Record<string, number> = {}
  for (const e of businessRows) {
    const v = e.vendor_name ?? "Unknown"
    vendorMap[v] = (vendorMap[v] ?? 0) + (e.total_amount ?? 0)
  }
  const topVendors = Object.entries(vendorMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  // ── Monthly Expense Breakdown ───────────────────────────────────────────────

  const monthlyExpenses = new Map<string, number>()
  const allExpenseMonths = new Set<string>()

  for (const e of resolvedExpenses) {
    if (e.isBusiness && e.document_date) {
      const ym = e.document_date.slice(0, 7)
      monthlyExpenses.set(ym, (monthlyExpenses.get(ym) ?? 0) + (e.total_amount ?? 0))
      allExpenseMonths.add(ym)
    }
  }

  const sortedMonths = Array.from(allExpenseMonths).sort()
  let fullMonthRange: string[] = []
  if (sortedMonths.length >= 2) {
    const [startY, startM] = sortedMonths[0].split("-").map(Number)
    const [endY, endM] = sortedMonths[sortedMonths.length - 1].split("-").map(Number)
    let y = startY, m = startM
    while (y < endY || (y === endY && m <= endM)) {
      fullMonthRange.push(`${y}-${String(m).padStart(2, "0")}`)
      m++
      if (m > 12) { m = 1; y++ }
    }
  } else {
    fullMonthRange = sortedMonths
  }

  const missingMonths = fullMonthRange.filter(m => !monthlyExpenses.has(m))

  // ── Duplicate Detection ─────────────────────────────────────────────────────

  const dupMap = new Map<string, BizExpenseRow[]>()
  for (const e of resolvedExpenses) {
    if (e.vendor_name && e.total_amount != null && e.document_date) {
      const key = `${e.vendor_name.toLowerCase().trim()}|${e.total_amount.toFixed(2)}|${e.document_date}`
      const arr = dupMap.get(key) ?? []
      arr.push(e)
      dupMap.set(key, arr)
    }
  }
  const duplicates: DuplicateGroup[] = []
  for (const [key, items] of dupMap) {
    if (items.length > 1) duplicates.push({ key, items })
  }

  // ── Dates & Period ──────────────────────────────────────────────────────────

  const allDates   = expenses.map(e => e.document_date).filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null
  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })

  // ── CSV Export ──────────────────────────────────────────────────────────────

  function generateCSV(): string {
    const lines: string[] = []
    lines.push("Date,Vendor,Category,Schedule C Line,Amount,Business/Personal,Source File")

    for (const row of resolvedExpenses) {
      const scLine = getScheduleCLine(row.expense_category) ?? "N/A"
      lines.push([
        row.document_date ?? "",
        `"${(row.vendor_name ?? "").replace(/"/g, '""')}"`,
        `"${row.expense_category ?? "Uncategorized"}"`,
        scLine,
        (row.total_amount ?? 0).toFixed(2),
        row.isBusiness ? "Business" : "Personal",
        `"${row.filename.replace(/"/g, '""')}"`,
      ].join(","))
    }

    return lines.join("\n")
  }

  function downloadCSV() {
    const csv = generateCSV()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    const periodLabel = periodStart && periodEnd ? `${periodStart}_${periodEnd}` : "all"
    a.download = `business-expense-report-${periodLabel}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyCSV() {
    navigator.clipboard.writeText(generateCSV()).then(() => {
      setCsvCopied(true)
      setTimeout(() => setCsvCopied(false), 2000)
    })
  }

  function printReport() {
    window.print()
  }

  function updateAssumptions(patch: Partial<BusinessExpenseAssumptions>) {
    setAssumptions((prev) => normalizeBusinessExpenseAssumptions({ ...prev, ...patch }))
    setAssumptionsDirty(true)
  }

  async function saveAssumptions() {
    setSavingAssumptions(true)
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")

      const res = await fetch("/api/report-assumptions", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scope: BUSINESS_EXPENSE_SCOPE,
          assumptions,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to save assumptions")
      setAssumptions(normalizeBusinessExpenseAssumptions(json.assumptions))
      setAssumptionsDirty(false)
    } catch (err) {
      console.error("save assumptions error:", err)
      setError("Failed to save tax assumptions. Please try again.")
    } finally {
      setSavingAssumptions(false)
    }
  }

  function resetAssumptions(filingContext = assumptions.filing_context) {
    setAssumptions(getDefaultBusinessExpenseAssumptions(filingContext))
    setAssumptionsDirty(true)
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
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">

          {/* Back nav */}
          <div className="mb-8 flex items-center gap-3">
            <Link href="/tools/smart-storage">
              <button className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <span className="text-xs text-muted-foreground">Smart Storage / Reports</span>
          </div>

          {/* Report header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                AVINTELLIGENCE · Smart Storage
              </p>
              <h1 className="text-2xl font-light tracking-tight text-foreground">
                Business Expense Report
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {periodStart && periodEnd
                  ? `${formatDate(periodStart)} \u2013 ${formatDate(periodEnd)}`
                  : "All periods"
                }
                {" \u00b7 "}Generated {generatedDate}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
              <Button variant="outline" size="sm" className="gap-2 rounded-md text-xs" onClick={copyCSV}>
                <Copy className="h-3.5 w-3.5" />
                {csvCopied ? "Copied!" : "Copy CSV"}
              </Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-md text-xs" onClick={downloadCSV}>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-2 rounded-md text-xs" onClick={printReport}>
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </Button>
            </div>
          </div>

          {mixedCurrency && (
            <div className="mb-8 flex items-start gap-3 rounded border border-red-500/30 bg-red-500/5 p-4">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Mixed currencies detected ({currencies.join(", ")})
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Business Expense Report only aggregates a single currency at a time. Filter to one currency before relying on totals, duplicates, or tax-impact estimates.
                </p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-8 flex items-center gap-3 border-y border-border py-3 print:hidden">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Period</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">&mdash;</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            />
            <button
              onClick={() => { setDateFrom(""); setDateTo("") }}
              className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Source</span>
            <div className="relative">
              <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select
                value={targetFolder}
                onChange={e => setTargetFolder(e.target.value)}
                className="appearance-none rounded border border-border bg-background py-1 pl-7 pr-6 text-xs text-foreground"
              >
                <option value="">All data</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              Loading&hellip;
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-24 text-xs text-red-500">
              {error}
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              No expense data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Duplicate Warning Banner ── */}
              {!mixedCurrency && duplicates.length > 0 && (
                <div className="flex items-start gap-3 rounded border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <Ban className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {duplicates.length} potential duplicate{duplicates.length > 1 ? "s" : ""} detected
                    </p>
                    <div className="mt-1.5 space-y-1">
                      {duplicates.map(d => (
                        <p key={d.key} className="text-xs text-muted-foreground">
                          {d.items[0].vendor_name} &mdash; {fmt(d.items[0].total_amount ?? 0, currency)} on {d.items[0].document_date}
                          <span className="ml-1 text-yellow-500">({d.items.length} entries)</span>
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Missing Months Warning ── */}
              {!mixedCurrency && missingMonths.length > 0 && (
                <div className="flex items-start gap-3 rounded border border-yellow-500/20 bg-yellow-500/5 p-4">
                  <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {missingMonths.length} month{missingMonths.length > 1 ? "s" : ""} with no business expenses
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {missingMonths.map(ym => {
                        const [y, mo] = ym.split("-")
                        return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`
                      }).join(", ")}
                    </p>
                  </div>
                </div>
              )}

              {/* ── Summary Strip ── */}
              {!mixedCurrency && (
              <div className="grid grid-cols-2 divide-x divide-border border border-border sm:grid-cols-4">
                {[
                  { label: "Business Total",  value: fmt(totalBusiness, currency) },
                  { label: "Personal Total",  value: fmt(totalPersonal, currency) },
                  { label: "All Expenses",    value: fmt(totalAll, currency) },
                  { label: "Business Share",  value: `${businessPct.toFixed(1)}%` },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
              )}

              {/* ── Assumptions + Tax Impact ── */}
              <div className="rounded border border-border bg-muted/20">
                  <button
                    type="button"
                    onClick={() => setAssumptionsOpen((open) => !open)}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Custom Tax Assumptions
                      </p>
                      <p className="mt-1 text-xs text-foreground/80">
                        {assumptions.filing_context === "self_employed" ? "Self-employed" : "Employed"} · {assumptions.federal_marginal_rate.toFixed(1)}% federal · {assumptions.state_marginal_rate.toFixed(1)}% state{assumptions.include_self_employment_tax ? ` · ${assumptions.self_employment_tax_rate.toFixed(1)}% SE tax` : ""}
                        {!assumptionsLoaded ? " · loading…" : ""}
                      </p>
                    </div>
                    {assumptionsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </button>

                  {assumptionsOpen && (
                    <div className="border-t border-border px-5 py-4">
                      {mixedCurrency && (
                        <div className="mb-4 rounded border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-muted-foreground">
                          Custom assumptions can still be saved, but illustrative tax impact is disabled while multiple currencies are included in the filtered dataset.
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Filing Context</span>
                          <select
                            value={assumptions.filing_context}
                            onChange={(e) => {
                              const next = e.target.value === "employed" ? "employed" : "self_employed"
                              const defaults = getDefaultBusinessExpenseAssumptions(next)
                              setAssumptions((prev) => normalizeBusinessExpenseAssumptions({
                                ...prev,
                                filing_context: next,
                                include_self_employment_tax: next === "employed" ? false : prev.include_self_employment_tax,
                                self_employment_tax_rate: defaults.self_employment_tax_rate,
                              }))
                              setAssumptionsDirty(true)
                            }}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                          >
                            <option value="self_employed">Self-employed</option>
                            <option value="employed">Employed</option>
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Federal Marginal Rate %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={assumptions.federal_marginal_rate}
                            onChange={(e) => updateAssumptions({ federal_marginal_rate: Number(e.target.value) })}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">State Marginal Rate %</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={assumptions.state_marginal_rate}
                            onChange={(e) => updateAssumptions({ state_marginal_rate: Number(e.target.value) })}
                            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                          />
                        </label>

                        <div className="space-y-2 rounded border border-border/60 bg-background/60 px-3 py-3">
                          <label className="flex items-center justify-between gap-3">
                            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Include SE Tax</span>
                            <input
                              type="checkbox"
                              checked={assumptions.include_self_employment_tax}
                              onChange={(e) => updateAssumptions({ include_self_employment_tax: e.target.checked })}
                              className="h-4 w-4"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">SE Tax Rate %</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={assumptions.self_employment_tax_rate}
                              onChange={(e) => updateAssumptions({ self_employment_tax_rate: Number(e.target.value) })}
                              disabled={!assumptions.include_self_employment_tax}
                              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                            />
                          </label>
                        </div>
                      </div>

                      <label className="mt-4 block space-y-1">
                        <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Notes</span>
                        <textarea
                          value={assumptions.notes}
                          onChange={(e) => updateAssumptions({ notes: e.target.value })}
                          rows={3}
                          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground"
                          placeholder="Optional assumptions or preparer notes"
                        />
                      </label>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-2 rounded-md text-xs" onClick={saveAssumptions} disabled={!assumptionsDirty || savingAssumptions}>
                          {savingAssumptions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          {savingAssumptions ? "Saving..." : "Save Assumptions"}
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-md text-xs" onClick={() => resetAssumptions()}>
                          Reset Defaults
                        </Button>
                        {assumptionsLoaded && !assumptionsDirty && (
                          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Saved</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              {totalBusiness > 0 && (
                <div className="border border-border bg-muted/30 px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Illustrative Tax Impact
                  </p>
                  {mixedCurrency ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Unavailable while mixed currencies are included in the report.
                    </p>
                  ) : (
                    <p className="mt-1 font-mono text-xl tabular-nums text-foreground">
                      {fmt(estimatedTaxImpact, currency)}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    Based on {fmt(totalBusiness, currency)} of business-classified expenses and your selected assumptions:
                    {` ${assumptions.federal_marginal_rate.toFixed(1)}% federal + ${assumptions.state_marginal_rate.toFixed(1)}% state`}
                    {assumptions.include_self_employment_tax ? ` + ${assumptions.self_employment_tax_rate.toFixed(1)}% SE tax` : ""}.
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Uses your selected assumptions. Not a filing calculation.
                  </p>
                </div>
              )}

              {/* ── Business by Category ── */}
              {!mixedCurrency && businessByCategory.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Business Expenses by Category
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium">Sched C</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">Share</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {businessByCategory.map(cat => (
                        <tr key={cat.category}>
                          <td className="py-2 text-foreground">{cat.category}</td>
                          <td className="py-2 text-muted-foreground">{getScheduleCLine(cat.category) ?? "\u2014"}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-foreground">
                            {fmt(cat.total, currency)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {totalBusiness > 0 ? `${((cat.total / totalBusiness) * 100).toFixed(1)}%` : "\u2014"}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{cat.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border font-medium">
                        <td className="pt-2 text-foreground">Total</td>
                        <td className="pt-2" />
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">{fmt(totalBusiness, currency)}</td>
                        <td className="pt-2 text-right text-muted-foreground">100%</td>
                        <td className="pt-2 text-right text-muted-foreground">{businessRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Monthly Expense Summary ── */}
              {!mixedCurrency && fullMonthRange.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Monthly Expense Summary
                  </p>
                  <div className="rounded border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 pb-2 pt-3 font-medium">Month</th>
                          <th className="px-4 pb-2 pt-3 text-right font-medium">Amount</th>
                          <th className="px-4 pb-2 pt-3 font-medium">Bar</th>
                          <th className="px-4 pb-2 pt-3 text-right font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {fullMonthRange.map(ym => {
                          const amount = monthlyExpenses.get(ym) ?? 0
                          const maxMonth = Math.max(...Array.from(monthlyExpenses.values()), 1)
                          const barPct = (amount / maxMonth) * 100
                          const isMissing = amount === 0
                          const [y, mo] = ym.split("-")
                          return (
                            <tr key={ym} className={isMissing ? "bg-yellow-500/5" : ""}>
                              <td className="px-4 py-2 text-foreground">{MONTH_NAMES[parseInt(mo) - 1]} {y}</td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                                {amount > 0 ? fmt(amount, currency) : "\u2014"}
                              </td>
                              <td className="px-4 py-2">
                                <div className="h-2 w-full rounded-full bg-border/30">
                                  <div className="h-2 rounded-full bg-foreground/20" style={{ width: `${barPct}%` }} />
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right">
                                {isMissing ? (
                                  <span className="text-[10px] text-yellow-500">No records</span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">{
                                    resolvedExpenses.filter(r => r.isBusiness && r.document_date?.startsWith(ym)).length
                                  } docs</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="px-4 pb-3 pt-2.5 text-foreground">Total</td>
                          <td className="px-4 pb-3 pt-2.5 text-right font-mono tabular-nums text-foreground">
                            {fmt(totalBusiness, currency)}
                          </td>
                          <td className="px-4 pb-3 pt-2.5" />
                          <td className="px-4 pb-3 pt-2.5 text-right text-xs text-muted-foreground">
                            {businessRows.length} total
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Top Business Vendors ── */}
              {!mixedCurrency && topVendors.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Top Business Vendors
                  </p>
                  <div className="divide-y divide-border border border-border">
                    {topVendors.map(([vendor, total], i) => (
                      <div key={vendor} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-5 text-right font-mono text-[10px] text-muted-foreground/50">{i + 1}</span>
                          <span className="text-xs text-foreground">{vendor}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="hidden w-32 sm:block">
                            <div className="h-1 w-full rounded-full bg-border">
                              <div
                                className="h-1 rounded-full bg-foreground/40"
                                style={{ width: `${(total / topVendors[0][1]) * 100}%` }}
                              />
                            </div>
                          </div>
                          <span className="font-mono text-xs tabular-nums text-foreground">
                            {fmt(total, currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Full Transaction Detail ── */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Full Transaction Detail
                  </p>
                  {Object.keys(overrides).length > 0 && (
                    <button
                      onClick={() => setOverrides({})}
                      className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Reset overrides ({Object.keys(overrides).length})
                    </button>
                  )}
                </div>
                <p className="mb-3 text-[10px] text-muted-foreground/60">
                  Click the Business / Personal badge to reclassify a transaction.
                </p>
                <div className="divide-y divide-border border border-border">
                  {resolvedExpenses.map((row) => {
                    const isOverridden = row.id in overrides
                    const lowConfidence = row.confidence_score !== null && row.confidence_score < 0.7
                    return (
                      <div
                        key={row.id}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${isOverridden ? "ring-1 ring-inset ring-amber-400/60" : ""} ${lowConfidence ? "bg-yellow-500/5" : ""}`}
                      >
                        {/* Date */}
                        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
                          {row.document_date ? formatDate(row.document_date) : "\u2014"}
                        </span>
                        {/* Vendor */}
                        <span className="min-w-0 flex-1 text-xs text-foreground">
                          {truncate(row.vendor_name ?? row.filename, 40)}
                        </span>
                        {/* Category */}
                        <span className="hidden text-[10px] text-muted-foreground/70 sm:block">
                          {row.expense_category ?? "\u2014"}
                        </span>
                        {/* Reclassify badge */}
                        <button
                          onClick={() => toggle(row.id, row.isBusiness)}
                          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors ${
                            row.isBusiness
                              ? "bg-foreground/10 text-foreground hover:bg-foreground/20"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {row.isBusiness ? "Business" : "Personal"}
                        </button>
                        {/* Amount */}
                        <span className="shrink-0 font-mono text-xs tabular-nums text-foreground">
                          {row.total_amount != null ? fmt(row.total_amount, row.currency ?? currency) : "\u2014"}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* Totals row */}
                {!mixedCurrency && (
                  <div className="flex items-center justify-between border border-t-0 border-border px-5 py-3">
                    <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                      Total ({expenses.length} documents)
                    </span>
                    <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                      {fmt(totalAll, currency)}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Disclaimer ── */}
              <p className="border-t border-border pt-6 text-[10px] leading-relaxed text-muted-foreground/60">
                Business classification is AI-generated based on expense category. Click any badge above to override.
                Overrides are local to this session. Illustrative tax impact uses your saved assumptions and remains an estimate only &mdash; consult your accountant.
                This report is informational and does not constitute a certified financial statement.
              </p>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function BusinessExpensePage() {
  return (
    <Suspense fallback={null}>
      <BusinessExpenseContent />
    </Suspense>
  )
}
