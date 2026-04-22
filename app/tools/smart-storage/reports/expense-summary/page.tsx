"use client"

import { Suspense, useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { summarizeCurrencies } from "@/lib/report-utils"
import type { Session } from "@supabase/supabase-js"
import { AlertTriangle, ArrowLeft, FolderOpen, Printer } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

interface FolderOption { id: string; name: string }

// ── Types ──────────────────────────────────────────────────────────────────────

interface ExpenseRow {
  filename: string
  document_type: string
  vendor_name: string | null
  document_date: string | null
  total_amount: number | null
  currency: string | null
  expense_category: string | null
  confidence_score: number | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

function ExpenseSummaryContent() {
  const searchParams = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro } = useEntitlement(session)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState(searchParams.get("targetFolder") ?? "")

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

      const res = await fetch(`/api/reports/expense-summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load expense data.")

      const rows = Array.isArray(json.expenses) ? json.expenses : []
      setExpenses(rows.map((row: any) => ({
        filename:         row.files?.filename ?? "unknown",
        document_type:    row.files?.document_type ?? "unknown",
        vendor_name:      row.vendor_name,
        document_date:    row.document_date,
        total_amount:     safeNum(row.total_amount),
        currency:         row.currency,
        expense_category: row.expense_category,
        confidence_score: row.confidence_score,
      })))
    } catch (err) {
      console.error("loadExpenses error:", err)
      setError("Failed to load expense data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const { primaryCurrency: currency, currencies, mixedCurrency } = summarizeCurrencies(expenses)
  const totalExpenses = expenses.reduce((s, e) => s + (e.total_amount ?? 0), 0)

  // Group by category (sorted by amount desc)
  const byCategory = Object.values(
    expenses.reduce((acc: Record<string, { category: string; total: number; count: number }>, row) => {
      const cat = row.expense_category ?? "Uncategorized"
      if (!acc[cat]) acc[cat] = { category: cat, total: 0, count: 0 }
      acc[cat].total += row.total_amount ?? 0
      acc[cat].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  // Group by vendor (sorted by amount desc)
  const byVendor = Object.values(
    expenses.reduce((acc: Record<string, { category: string; total: number; count: number }>, row) => {
      const v = row.vendor_name ?? "Unknown"
      if (!acc[v]) acc[v] = { category: v, total: 0, count: 0 }
      acc[v].total += row.total_amount ?? 0
      acc[v].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  const allDates = expenses.map(e => e.document_date).filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null

  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })

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

          {/* Back nav */}
          <div className="mb-8 flex items-center gap-3">
            <Link href="/tools/smart-storage">
              <button className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <span className="text-xs text-muted-foreground">Smart Storage / Reports</span>
          </div>

          {/* Filters */}
          <div className="mb-8 flex flex-wrap items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Period</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
            <span className="text-xs text-muted-foreground">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
            <button onClick={() => { setDateFrom(""); setDateTo("") }}
              className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              Clear
            </button>

            <span className="mx-1 h-4 w-px bg-border" />

            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Source</span>
            <div className="relative">
              <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select
                value={targetFolder}
                onChange={e => setTargetFolder(e.target.value)}
                className="appearance-none rounded border border-border bg-background py-1.5 pl-7 pr-6 text-xs text-foreground"
              >
                <option value="">All data</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-xs uppercase tracking-widest text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-32 text-xs text-red-500">
              {error}
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex items-center justify-center py-32 text-xs text-muted-foreground">
              No expense data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Report Header ── */}
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Expense Summary</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      {periodStart && periodEnd ? (
                        <span>Period: {formatDate(periodStart)} – {formatDate(periodEnd)}</span>
                      ) : (
                        <span>All periods</span>
                      )}
                      <span className="text-muted-foreground/30">·</span>
                      <span>Generated {generatedDate}</span>
                    </div>
                  </div>
                  <div className="print:hidden">
                    <Button variant="outline" size="sm" className="shrink-0 gap-2 rounded text-xs" onClick={() => window.print()}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </Button>
                  </div>
                </div>
              </div>

              {mixedCurrency && (
                <div className="flex items-start gap-3 rounded border border-red-500/30 bg-red-500/5 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Mixed currencies detected ({currencies.join(", ")})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Expense Summary only aggregates a single currency at a time. Filter this report to one currency bucket before relying on totals.
                    </p>
                  </div>
                </div>
              )}

              {!mixedCurrency && (
                <>
                  {/* ── Summary Strip ── */}
                  <div className="grid grid-cols-2 divide-x divide-border border border-border rounded sm:grid-cols-4">
                    {[
                      { label: "Total Expenses",  value: fmt(totalExpenses, currency) },
                      { label: "Documents",        value: String(expenses.length) },
                      { label: "Categories",       value: String(byCategory.length) },
                      { label: "Avg per Document", value: expenses.length > 0 ? fmt(totalExpenses / expenses.length, currency) : "—" },
                    ].map(item => (
                      <div key={item.label} className="px-5 py-4">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                        <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Schedule of Expenses by Category ── */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Schedule of Expenses by Category
                    </p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="pb-2 font-medium">Category</th>
                          <th className="pb-2 text-right font-medium">Amount</th>
                          <th className="pb-2 text-right font-medium">% of Total</th>
                          <th className="pb-2 text-right font-medium">Docs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {byCategory.map(cat => (
                          <tr key={cat.category}>
                            <td className="py-2.5 text-foreground">{cat.category}</td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              ({fmt(cat.total, currency)})
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">
                              {totalExpenses > 0 ? `${((cat.total / totalExpenses) * 100).toFixed(1)}%` : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">{cat.count}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="pt-2.5 text-foreground">Total</td>
                          <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                          <td className="pt-2.5 text-right text-muted-foreground">100%</td>
                          <td className="pt-2.5 text-right text-muted-foreground">{expenses.length}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* ── By Vendor ── */}
                  {byVendor.length > 0 && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        By Vendor
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                            <th className="pb-2 font-medium">Vendor</th>
                            <th className="pb-2 text-right font-medium">Amount</th>
                            <th className="pb-2 text-right font-medium">% of Total</th>
                            <th className="pb-2 text-right font-medium">Docs</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {byVendor.map(v => (
                            <tr key={v.category}>
                              <td className="py-2 text-foreground">{v.category}</td>
                              <td className="py-2 text-right font-mono tabular-nums text-foreground">
                                ({fmt(v.total, currency)})
                              </td>
                              <td className="py-2 text-right text-muted-foreground">
                                {totalExpenses > 0 ? `${((v.total / totalExpenses) * 100).toFixed(1)}%` : "—"}
                              </td>
                              <td className="py-2 text-right text-muted-foreground">{v.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ── Transaction Detail ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Transaction Detail
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Vendor</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {expenses.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 text-muted-foreground">
                          {row.document_date ? formatDate(row.document_date) : "—"}
                        </td>
                        <td className="py-2 text-foreground">{row.vendor_name ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">{row.expense_category ?? "—"}</td>
                        <td className="py-2 text-muted-foreground capitalize">{row.document_type}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {row.total_amount != null ? `(${fmt(row.total_amount, row.currency ?? currency)})` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    {!mixedCurrency && (
                      <tr className="border-t-2 border-border font-semibold">
                        <td colSpan={4} className="pt-2 text-foreground">Total</td>
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">
                          ({fmt(totalExpenses, currency)})
                        </td>
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>

              {/* ── Disclaimer ── */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  Figures are derived from normalized fields extracted from uploaded receipts and invoices.
                  Accuracy depends on document quality and AI classification confidence.
                  This report is informational and does not constitute a certified financial statement.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function ExpenseSummaryPage() {
  return (
    <Suspense fallback={null}>
      <ExpenseSummaryContent />
    </Suspense>
  )
}
