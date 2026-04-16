"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { summarizeCurrencies } from "@/lib/report-utils"
import type { Session } from "@supabase/supabase-js"
import { AlertTriangle, ArrowLeft, FolderOpen, Printer } from "lucide-react"
import Link from "next/link"

interface FolderOption { id: string; name: string }

// ── Types ──────────────────────────────────────────────────────────────────────

interface IncomeEntry {
  document_date: string | null
  gross_income: number | null
  net_income: number | null
  total_amount: number | null
  currency: string | null
  document_type: string
  employer_name: string | null
}

interface ExpenseEntry {
  document_date: string | null
  total_amount: number | null
  currency: string | null
  document_type: string
  vendor_name: string | null
  expense_category: string | null
}

interface MonthRow {
  month: string
  label: string
  revenue: number
  expenses: number
  net: number
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

function monthLabel(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-US", {
    year: "numeric", month: "short",
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro } = useEntitlement(session)
  const [incomeRows, setIncomeRows] = useState<IncomeEntry[]>([])
  const [expenseRows, setExpenseRows] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState("")

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

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    setIncomeRows([])
    setExpenseRows([])
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")

      const params = new URLSearchParams()
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (targetFolder) params.set("targetFolder", targetFolder)

      const res = await fetch(`/api/reports/profit-loss?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load financial data.")

      const incomeData = Array.isArray(json.incomeRows) ? json.incomeRows.map((r: any) => ({
        document_date: r.document_date,
        gross_income:  r.gross_income  != null ? safeNum(r.gross_income)  : null,
        net_income:    r.net_income    != null ? safeNum(r.net_income)    : null,
        total_amount:  r.total_amount  != null ? safeNum(r.total_amount)  : null,
        currency:      r.currency,
        document_type: r.files?.document_type ?? "unknown",
        employer_name: r.employer_name,
      })) : []

      const expenseData = Array.isArray(json.expenseRows) ? json.expenseRows.map((r: any) => ({
        document_date:    r.document_date,
        total_amount:     r.total_amount != null ? safeNum(r.total_amount) : null,
        currency:         r.currency,
        document_type:    r.files?.document_type ?? "unknown",
        vendor_name:      r.vendor_name,
        expense_category: r.expense_category,
      })) : []

      setIncomeRows(incomeData)
      setExpenseRows(expenseData)
    } catch (err) {
      console.error("loadData error:", err)
      setError("Failed to load financial data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadData() }, [loadData])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const { primaryCurrency: currency, currencies, mixedCurrency } = summarizeCurrencies([...incomeRows, ...expenseRows])
  const totalRevenue  = incomeRows.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const netPosition   = totalRevenue - totalExpenses
  const netMargin     = totalRevenue > 0 ? (netPosition / totalRevenue) * 100 : null

  // Group income by employer / source
  const incomeBySource = new Map<string, number>()
  for (const r of incomeRows) {
    const key = r.employer_name ?? "Other Income"
    incomeBySource.set(key, (incomeBySource.get(key) ?? 0) + (r.gross_income ?? r.total_amount ?? 0))
  }

  // Group expenses by category
  const expenseByCategory = new Map<string, number>()
  for (const r of expenseRows) {
    const key = r.expense_category ?? "Uncategorized"
    expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + (r.total_amount ?? 0))
  }

  // Period
  const allDates = [
    ...incomeRows.map(r => r.document_date),
    ...expenseRows.map(r => r.document_date),
  ].filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null

  // Monthly breakdown
  const monthMap: Record<string, MonthRow> = {}
  for (const r of incomeRows) {
    const ym = r.document_date?.slice(0, 7)
    if (!ym) continue
    if (!monthMap[ym]) monthMap[ym] = { month: ym, label: monthLabel(ym), revenue: 0, expenses: 0, net: 0 }
    monthMap[ym].revenue += r.gross_income ?? r.total_amount ?? 0
  }
  for (const r of expenseRows) {
    const ym = r.document_date?.slice(0, 7)
    if (!ym) continue
    if (!monthMap[ym]) monthMap[ym] = { month: ym, label: monthLabel(ym), revenue: 0, expenses: 0, net: 0 }
    monthMap[ym].expenses += r.total_amount ?? 0
  }
  const monthRows: MonthRow[] = Object.values(monthMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(r => ({ ...r, net: r.revenue - r.expenses }))

  const hasData = incomeRows.length > 0 || expenseRows.length > 0
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
          ) : !hasData ? (
            <div className="flex items-center justify-center py-32 text-xs text-muted-foreground">
              No income or expense data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Report Header ── */}
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Profit & Loss Statement</h1>
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
                      Profit &amp; Loss only aggregates a single currency at a time. Filter to one currency before relying on totals, margin, or monthly breakdown.
                    </p>
                  </div>
                </div>
              )}

              {!mixedCurrency && (
                <>
                  {/* ── Summary Strip ── */}
                  <div className="grid grid-cols-2 divide-x divide-border border border-border rounded sm:grid-cols-4">
                    {[
                      { label: "Total Revenue",  value: fmt(totalRevenue, currency),  sub: null, loss: false },
                      { label: "Total Expenses", value: fmt(totalExpenses, currency), sub: null, loss: false },
                      {
                        label: "Net Position",
                        value: netPosition >= 0 ? fmt(netPosition, currency) : `(${fmt(Math.abs(netPosition), currency)})`,
                        sub: netPosition >= 0 ? "Surplus" : "Deficit",
                        loss: netPosition < 0,
                      },
                      {
                        label: "Net Margin",
                        value: netMargin !== null ? `${netMargin.toFixed(1)}%` : "—",
                        sub: "of revenue",
                        loss: netMargin !== null && netMargin < 0,
                      },
                    ].map(item => (
                      <div key={item.label} className="px-5 py-4">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                        <p className={`mt-1.5 font-mono text-base font-medium tabular-nums ${item.loss ? "text-destructive" : "text-foreground"}`}>
                          {item.value}
                        </p>
                        {item.sub && (
                          <p className={`mt-0.5 text-[10px] ${item.loss ? "text-destructive/70" : "text-muted-foreground"}`}>
                            {item.sub}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── P&L Statement Table ── */}
                  <div>
                    <table className="w-full text-sm">
                  <colgroup>
                    <col style={{ width: "2rem" }} />
                    <col />
                    <col style={{ width: "11rem" }} />
                  </colgroup>
                  <tbody>

                    {/* REVENUE */}
                    <tr>
                      <td colSpan={3} className="pb-2 pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Revenue</span>
                      </td>
                    </tr>
                    {incomeRows.length === 0 ? (
                      <tr>
                        <td />
                        <td className="py-1.5 text-xs italic text-muted-foreground">No income documents in this period</td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">—</td>
                      </tr>
                    ) : (
                      Array.from(incomeBySource.entries()).map(([source, amount]) => (
                        <tr key={source}>
                          <td />
                          <td className="py-1.5 text-foreground/80">{source}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{fmt(amount, currency)}</td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t border-border">
                      <td />
                      <td className="py-2 font-medium text-foreground">Total Revenue</td>
                      <td className="py-2 text-right font-mono font-medium tabular-nums text-foreground">{fmt(totalRevenue, currency)}</td>
                    </tr>

                    {/* Spacer */}
                    <tr><td colSpan={3} className="py-3" /></tr>

                    {/* EXPENSES */}
                    <tr>
                      <td colSpan={3} className="pb-2">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Expenses</span>
                      </td>
                    </tr>
                    {expenseRows.length === 0 ? (
                      <tr>
                        <td />
                        <td className="py-1.5 text-xs italic text-muted-foreground">No expense documents in this period</td>
                        <td className="py-1.5 text-right font-mono text-muted-foreground">—</td>
                      </tr>
                    ) : (
                      Array.from(expenseByCategory.entries()).map(([cat, amount]) => (
                        <tr key={cat}>
                          <td />
                          <td className="py-1.5 text-foreground/80">{cat}</td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-foreground">({fmt(amount, currency)})</td>
                        </tr>
                      ))
                    )}
                    <tr className="border-t border-border">
                      <td />
                      <td className="py-2 font-medium text-foreground">Total Expenses</td>
                      <td className="py-2 text-right font-mono font-medium tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                    </tr>

                    {/* NET INCOME — double border */}
                    <tr className="border-t-4 border-double border-border">
                      <td />
                      <td className="py-3 text-base font-semibold text-foreground">
                        {netPosition >= 0 ? "Net Income" : "Net Loss"}
                      </td>
                      <td className={`py-3 text-right font-mono tabular-nums text-base font-semibold ${netPosition >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {netPosition >= 0
                          ? fmt(netPosition, currency)
                          : `(${fmt(Math.abs(netPosition), currency)})`}
                      </td>
                    </tr>
                    {netMargin !== null && (
                      <tr>
                        <td />
                        <td className="pb-2 text-xs text-muted-foreground">Net Margin</td>
                        <td className={`pb-2 text-right font-mono text-xs tabular-nums ${netMargin < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {netMargin.toFixed(1)}%
                        </td>
                      </tr>
                    )}

                  </tbody>
                    </table>
                  </div>

                  {/* ── Monthly Breakdown ── */}
                  {monthRows.length > 0 && (
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Monthly Breakdown
                      </p>
                      <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="pb-2 font-medium">Month</th>
                        <th className="pb-2 text-right font-medium">Revenue</th>
                        <th className="pb-2 text-right font-medium">Expenses</th>
                        <th className="pb-2 text-right font-medium">Net</th>
                        <th className="pb-2 text-right font-medium">Margin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {monthRows.map((row) => {
                        const margin = row.revenue > 0 ? (row.net / row.revenue) * 100 : null
                        return (
                          <tr key={row.month}>
                            <td className="py-2 text-foreground">{row.label}</td>
                            <td className="py-2 text-right font-mono tabular-nums text-foreground">
                              {row.revenue > 0 ? fmt(row.revenue, currency) : "—"}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-foreground">
                              {row.expenses > 0 ? `(${fmt(row.expenses, currency)})` : "—"}
                            </td>
                            <td className={`py-2 text-right font-mono tabular-nums ${row.net >= 0 ? "text-foreground" : "text-destructive"}`}>
                              {row.net >= 0 ? fmt(row.net, currency) : `(${fmt(Math.abs(row.net), currency)})`}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {margin !== null ? `${margin.toFixed(1)}%` : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2 text-foreground">Total</td>
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">{fmt(totalRevenue, currency)}</td>
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                        <td className={`pt-2 text-right font-mono tabular-nums ${netPosition >= 0 ? "text-foreground" : "text-destructive"}`}>
                          {netPosition >= 0 ? fmt(netPosition, currency) : `(${fmt(Math.abs(netPosition), currency)})`}
                        </td>
                        <td className="pt-2 text-right text-muted-foreground">
                          {netMargin !== null ? `${netMargin.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* ── Supporting Documents ── */}
              {(incomeRows.length > 0 || expenseRows.length > 0) && (
                <div className="border-t border-border pt-6">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Supporting Documents ({incomeRows.length + expenseRows.length})
                  </p>
                  <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    {incomeRows.map((r, i) => (
                      <div key={`inc-${i}`} className="flex items-baseline justify-between border-b border-border/40 py-1">
                        <span className="truncate text-xs text-muted-foreground">{r.employer_name ?? "Income document"}</span>
                        <span className="ml-4 shrink-0 text-[10px] text-muted-foreground/50">
                          {r.document_date ? formatDate(r.document_date) : "—"}
                        </span>
                      </div>
                    ))}
                    {expenseRows.map((r, i) => (
                      <div key={`exp-${i}`} className="flex items-baseline justify-between border-b border-border/40 py-1">
                        <span className="truncate text-xs text-muted-foreground">{r.vendor_name ?? "Expense document"}</span>
                        <span className="ml-4 shrink-0 text-[10px] text-muted-foreground/50">
                          {r.document_date ? formatDate(r.document_date) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Disclaimer ── */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  Figures are derived from normalized fields extracted from uploaded documents. Revenue includes payslips and income statements.
                  Expenses include receipts and invoices. Accuracy depends on document quality and AI classification confidence.
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
