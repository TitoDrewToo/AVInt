"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

// ── Types ─────────────────────────────────────────────────────────────────────

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
  month: string        // "YYYY-MM"
  label: string        // "Jan 2025"
  revenue: number
  expenses: number
  net: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("en-PH", {
    year: "numeric", month: "short",
  })
}

function dominantCurrency(entries: { currency: string | null }[]): string {
  const counts: Record<string, number> = {}
  for (const e of entries) {
    const c = e.currency ?? "USD"
    counts[c] = (counts[c] ?? 0) + 1
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProfitLossPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [incomeRows, setIncomeRows] = useState<IncomeEntry[]>([])
  const [expenseRows, setExpenseRows] = useState<ExpenseEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

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

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const userId = session.user.id

    // ── Income side: payslips + income statements ────────────────────────────
    const { data: incomeFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", userId)
      .in("document_type", ["payslip", "income_statement"])

    let incomeData: IncomeEntry[] = []
    if (incomeFiles?.length) {
      let q = supabase
        .from("document_fields")
        .select("document_date, gross_income, net_income, total_amount, currency, employer_name, files!inner(document_type)")
        .in("file_id", incomeFiles.map(f => f.id))
        .order("document_date", { ascending: true })
      if (dateFrom) q = q.gte("document_date", dateFrom)
      if (dateTo)   q = q.lte("document_date", dateTo)
      const { data } = await q
      if (data) {
        incomeData = data.map((r: any) => ({
          document_date:  r.document_date,
          gross_income:   r.gross_income   != null ? parseFloat(r.gross_income)  : null,
          net_income:     r.net_income     != null ? parseFloat(r.net_income)    : null,
          total_amount:   r.total_amount   != null ? parseFloat(r.total_amount)  : null,
          currency:       r.currency,
          document_type:  r.files.document_type,
          employer_name:  r.employer_name,
        }))
      }
    }

    // ── Expense side: receipts + invoices ────────────────────────────────────
    const { data: expenseFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", userId)
      .in("document_type", ["receipt", "invoice"])

    let expenseData: ExpenseEntry[] = []
    if (expenseFiles?.length) {
      let q = supabase
        .from("document_fields")
        .select("document_date, total_amount, currency, vendor_name, expense_category, files!inner(document_type)")
        .in("file_id", expenseFiles.map(f => f.id))
        .order("document_date", { ascending: true })
      if (dateFrom) q = q.gte("document_date", dateFrom)
      if (dateTo)   q = q.lte("document_date", dateTo)
      const { data } = await q
      if (data) {
        expenseData = data.map((r: any) => ({
          document_date:    r.document_date,
          total_amount:     r.total_amount != null ? parseFloat(r.total_amount) : null,
          currency:         r.currency,
          document_type:    r.files.document_type,
          vendor_name:      r.vendor_name,
          expense_category: r.expense_category,
        }))
      }
    }

    setIncomeRows(incomeData)
    setExpenseRows(expenseData)
    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  // ── Aggregations ─────────────────────────────────────────────────────────────

  const currency = dominantCurrency([...incomeRows, ...expenseRows])

  // Revenue: prefer gross_income, fall back to total_amount
  const totalRevenue  = incomeRows.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const netPosition   = totalRevenue - totalExpenses
  const netMargin     = totalRevenue > 0 ? (netPosition / totalRevenue) * 100 : null

  // Period covered
  const allDates = [
    ...incomeRows.map(r => r.document_date),
    ...expenseRows.map(r => r.document_date),
  ].filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null

  // Monthly breakdown: merge income and expense rows by YYYY-MM
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

  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">

          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/tools/smart-storage">
                <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" />
                </button>
              </Link>
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Profit & Loss Summary</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Generated {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" })}
                  {periodStart && periodEnd && (
                    <span className="ml-2 text-muted-foreground/60">
                      · Period: {formatDate(periodStart)} – {formatDate(periodEnd)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg gap-2" disabled>
              <Download className="h-4 w-4" />
              Export PDF
            </Button>
          </div>

          {/* Date filter */}
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <span className="text-sm text-muted-foreground">Date range</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
            <span className="text-sm text-muted-foreground">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground" />
            <Button size="sm" variant="outline" className="rounded-lg"
              onClick={() => { setDateFrom(""); setDateTo("") }}>Clear</Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              Loading P&L data…
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              No income or expense data found for the selected period.
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── KPI row ── */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Revenue</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalRevenue, currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{incomeRows.length} income document{incomeRows.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expenses</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalExpenses, currency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{expenseRows.length} expense document{expenseRows.length !== 1 ? "s" : ""}</p>
                </div>
                <div className={`rounded-xl border p-5 ${netPosition >= 0 ? "border-border bg-card" : "border-destructive/30 bg-destructive/5"}`}>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Position</p>
                  <p className={`mt-2 text-2xl font-semibold ${netPosition >= 0 ? "text-foreground" : "text-destructive"}`}>
                    {netPosition >= 0 ? "" : "–"}{formatCurrency(Math.abs(netPosition), currency)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{netPosition >= 0 ? "Surplus" : "Deficit"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Margin</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {netMargin !== null ? `${netMargin.toFixed(1)}%` : "—"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">of total revenue</p>
                </div>
              </div>

              {/* ── P&L Statement ── */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Statement</h2>
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-2.5 font-medium text-foreground">Revenue</td>
                      <td className="py-2.5 text-right font-medium text-foreground">{formatCurrency(totalRevenue, currency)}</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-2.5 text-foreground">Expenses</td>
                      <td className="py-2.5 text-right text-foreground">({formatCurrency(totalExpenses, currency)})</td>
                    </tr>
                    <tr className="border-b-2 border-border">
                      <td className="py-2.5 font-semibold text-foreground">Net Position</td>
                      <td className={`py-2.5 text-right font-semibold ${netPosition >= 0 ? "text-foreground" : "text-destructive"}`}>
                        {netPosition >= 0 ? formatCurrency(netPosition, currency) : `(${formatCurrency(Math.abs(netPosition), currency)})`}
                      </td>
                    </tr>
                    {netMargin !== null && (
                      <tr>
                        <td className="pt-2.5 text-xs text-muted-foreground">Net Margin</td>
                        <td className="pt-2.5 text-right text-xs text-muted-foreground">{netMargin.toFixed(1)}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Monthly Breakdown ── */}
              {monthRows.length > 1 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Monthly Breakdown</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          <th className="pb-3 pr-4">Month</th>
                          <th className="pb-3 pr-4 text-right">Revenue</th>
                          <th className="pb-3 pr-4 text-right">Expenses</th>
                          <th className="pb-3 pr-4 text-right">Net</th>
                          <th className="pb-3 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {monthRows.map((row) => {
                          const margin = row.revenue > 0 ? (row.net / row.revenue) * 100 : null
                          return (
                            <tr key={row.month}>
                              <td className="py-3 pr-4 font-medium text-foreground">{row.label}</td>
                              <td className="py-3 pr-4 text-right text-foreground">
                                {row.revenue > 0 ? formatCurrency(row.revenue, currency) : "—"}
                              </td>
                              <td className="py-3 pr-4 text-right text-foreground">
                                {row.expenses > 0 ? formatCurrency(row.expenses, currency) : "—"}
                              </td>
                              <td className={`py-3 pr-4 text-right font-medium ${row.net >= 0 ? "text-foreground" : "text-destructive"}`}>
                                {row.net >= 0 ? formatCurrency(row.net, currency) : `(${formatCurrency(Math.abs(row.net), currency)})`}
                              </td>
                              <td className="py-3 text-right text-muted-foreground">
                                {margin !== null ? `${margin.toFixed(1)}%` : "—"}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border text-sm font-semibold">
                          <td className="pt-3 text-foreground">Total</td>
                          <td className="pt-3 text-right text-foreground">{formatCurrency(totalRevenue, currency)}</td>
                          <td className="pt-3 text-right text-foreground">{formatCurrency(totalExpenses, currency)}</td>
                          <td className={`pt-3 text-right ${netPosition >= 0 ? "text-foreground" : "text-destructive"}`}>
                            {netPosition >= 0 ? formatCurrency(netPosition, currency) : `(${formatCurrency(Math.abs(netPosition), currency)})`}
                          </td>
                          <td className="pt-3 text-right text-muted-foreground">
                            {netMargin !== null ? `${netMargin.toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Source breakdown ── */}
              <div className="grid grid-cols-2 gap-4">
                {/* Income sources */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Revenue Sources</h2>
                  {incomeRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No income documents in this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {incomeRows.map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{r.employer_name ?? "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.document_date ? formatDate(r.document_date) : "—"} · {r.document_type}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-foreground shrink-0">
                            {formatCurrency(r.gross_income ?? r.total_amount ?? 0, r.currency ?? currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expense sources */}
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Expense Sources</h2>
                  {expenseRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No expense documents in this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {expenseRows.map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{r.vendor_name ?? "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.document_date ? formatDate(r.document_date) : "—"} · {r.expense_category ?? r.document_type}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-foreground shrink-0">
                            ({formatCurrency(r.total_amount ?? 0, r.currency ?? currency)})
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Data quality note ── */}
              <div className="rounded-xl border border-border bg-muted/30 px-5 py-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Note:</span> Figures are derived from normalized fields extracted from uploaded documents.
                  Revenue includes payslips and income statements. Expenses include receipts and invoices.
                  Accuracy depends on document quality and classification confidence.
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
