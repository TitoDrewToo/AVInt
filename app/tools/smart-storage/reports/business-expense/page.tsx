"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download, FolderOpen } from "lucide-react"
import Link from "next/link"

// ── Constants ──────────────────────────────────────────────────────────────────

interface FolderOption { id: string; name: string }

const BUSINESS_CATEGORIES = new Set([
  "Office", "Office Supplies", "Equipment", "Hardware", "Software", "Subscriptions",
  "SaaS", "Cloud Services", "Internet", "Phone", "Utilities", "Rent", "Coworking",
  "Travel", "Transport", "Fuel", "Parking", "Accommodation", "Airfare",
  "Marketing", "Advertising", "Design", "Printing",
  "Meals", "Entertainment", "Client Entertainment",
  "Legal", "Accounting", "Professional Services", "Consulting",
  "Training", "Education", "Conferences",
  "Insurance", "Bank Fees", "Tax", "Taxes",
  "Repairs", "Maintenance",
])

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "PHP",
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function BusinessExpensePage() {
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro]                 = useState(false)
  const [expenses, setExpenses]           = useState<BizExpenseRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [dateFrom, setDateFrom]           = useState("")
  const [dateTo, setDateTo]               = useState("")
  const [folders, setFolders]             = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder]   = useState("")
  // overrides: id → true (force Business) | false (force Personal)
  const [overrides, setOverrides]         = useState<Record<string, boolean>>({})

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
    supabase.from("subscriptions").select("status").eq("user_id", session.user.id).single()
      .then(({ data }) => setIsPro(
        data?.status === "pro" || data?.status === "day_pass" || data?.status === "gift_code"
      ))
  }, [session])

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from("folders").select("id, name").eq("user_id", session.user.id).order("name")
      .then(({ data }) => { if (data) setFolders(data) })
  }, [session])

  const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

  const loadExpenses = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    try {
      let filesQuery = supabase
        .from("files")
        .select("id")
        .eq("user_id", session.user.id)
        .in("document_type", ["receipt", "invoice"])
      if (targetFolder) filesQuery = filesQuery.eq("folder_id", targetFolder)
      const { data: userFiles } = await filesQuery

      if (!userFiles?.length) { setLoading(false); return }

      let query = supabase
        .from("document_fields")
        .select(`
          file_id, vendor_name, document_date, total_amount, currency,
          expense_category, payment_method, tax_amount, confidence_score,
          files!inner(filename, document_type)
        `)
        .in("file_id", userFiles.map(f => f.id))
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setExpenses(data.map((row: any, i: number) => {
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
      }
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

  const _cc = expenses.reduce((acc: Record<string, number>, e) => {
    const c = e.currency ?? "PHP"; acc[c] = (acc[c] ?? 0) + Math.abs(e.total_amount ?? 0); return acc
  }, {})
  const currency = Object.entries(_cc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "PHP"

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
  const estTaxSavings = totalBusiness * 0.30

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

  const allDates   = expenses.map(e => e.document_date).filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null
  const generatedDate = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" })

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
          <div className="mb-8">
            <Link
              href="/tools/smart-storage"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Smart Storage
            </Link>
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
                  ? `${formatDate(periodStart)} – ${formatDate(periodEnd)}`
                  : "All periods"
                }
                {" · "}Generated {generatedDate}
              </p>
            </div>
            <Button variant="outline" size="sm" className="rounded-md gap-2 text-xs" disabled>
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </div>

          {/* Filters */}
          <div className="mb-8 flex items-center gap-3 border-y border-border py-3">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Period</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">—</span>
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
              Loading…
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

              {/* ── Summary Strip ── */}
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

              {/* ── Est. Tax Savings Callout ── */}
              {totalBusiness > 0 && (
                <div className="border border-border bg-muted/30 px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Estimated Tax Savings
                  </p>
                  <p className="mt-1 font-mono text-xl tabular-nums text-foreground">
                    {fmt(estTaxSavings, currency)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    Based on 30% effective tax rate applied to {fmt(totalBusiness, currency)} in deductible business expenses.
                    Consult your accountant to verify applicable rates.
                  </p>
                </div>
              )}

              {/* ── Business by Category ── */}
              {businessByCategory.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Business Expenses by Category
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">Share</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {businessByCategory.map(cat => (
                        <tr key={cat.category}>
                          <td className="py-2 text-foreground">{cat.category}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-foreground">
                            {fmt(cat.total, currency)}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">
                            {totalBusiness > 0 ? `${((cat.total / totalBusiness) * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-2 text-right text-muted-foreground">{cat.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border font-medium">
                        <td className="pt-2 text-foreground">Total</td>
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">{fmt(totalBusiness, currency)}</td>
                        <td className="pt-2 text-right text-muted-foreground">100%</td>
                        <td className="pt-2 text-right text-muted-foreground">{businessRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Top Business Vendors ── */}
              {topVendors.length > 0 && (
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
                    return (
                      <div
                        key={row.id}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 ${isOverridden ? "ring-1 ring-inset ring-amber-400/60" : ""}`}
                      >
                        {/* Date */}
                        <span className="w-24 shrink-0 text-[10px] text-muted-foreground">
                          {row.document_date ? formatDate(row.document_date) : "—"}
                        </span>
                        {/* Vendor */}
                        <span className="min-w-0 flex-1 text-xs text-foreground">
                          {truncate(row.vendor_name ?? row.filename, 40)}
                        </span>
                        {/* Category */}
                        <span className="hidden text-[10px] text-muted-foreground/70 sm:block">
                          {row.expense_category ?? "—"}
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
                          {row.total_amount != null ? fmt(row.total_amount, row.currency ?? currency) : "—"}
                        </span>
                      </div>
                    )
                  })}
                </div>
                {/* Totals row */}
                <div className="flex items-center justify-between border border-t-0 border-border px-5 py-3">
                  <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Total ({expenses.length} documents)
                  </span>
                  <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                    {fmt(totalAll, currency)}
                  </span>
                </div>
              </div>

              {/* ── Disclaimer ── */}
              <p className="border-t border-border pt-6 text-[10px] leading-relaxed text-muted-foreground/60">
                Business classification is AI-generated based on expense category. Click any badge above to override.
                Overrides are local to this session. Estimated tax savings use a 30% indicative rate — consult your accountant.
                This report is informational and does not constitute a certified financial statement.
              </p>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
