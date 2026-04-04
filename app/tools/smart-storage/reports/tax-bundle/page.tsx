"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

// ── Types ──────────────────────────────────────────────────────────────────────

interface TaxRow {
  filename: string
  document_type: string
  vendor_name: string | null
  employer_name: string | null
  document_date: string | null
  total_amount: number | null
  gross_income: number | null
  net_income: number | null
  expense_category: string | null
  currency: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function TaxBundlePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [rows, setRows] = useState<TaxRow[]>([])
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

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from("subscriptions").select("status").eq("user_id", session.user.id).single()
      .then(({ data }) => setIsPro(data?.status === "pro" || data?.status === "day_pass" || data?.status === "gift_code"))
  }, [session])

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    try {
      const { data: userFiles } = await supabase
        .from("files")
        .select("id, document_type")
        .eq("user_id", session.user.id)

      if (!userFiles?.length) return

      let query = supabase
        .from("document_fields")
        .select(`
          file_id, vendor_name, employer_name, document_date,
          total_amount, gross_income, net_income, expense_category, currency,
          files!inner(filename, document_type)
        `)
        .in("file_id", userFiles.map(f => f.id))
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setRows(data.map((row: any) => ({
          filename:         row.files.filename,
          document_type:    row.files.document_type,
          vendor_name:      row.vendor_name,
          employer_name:    row.employer_name,
          document_date:    row.document_date,
          total_amount:     row.total_amount  ? parseFloat(row.total_amount)  : null,
          gross_income:     row.gross_income  ? parseFloat(row.gross_income)  : null,
          net_income:       row.net_income    ? parseFloat(row.net_income)    : null,
          expense_category: row.expense_category,
          currency:         row.currency,
        })))
      }
    } catch (err) {
      console.error("loadData error:", err)
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const _currencyCount = rows.reduce((acc: Record<string, number>, r) => {
    const c = r.currency ?? "PHP"; acc[c] = (acc[c] ?? 0) + 1; return acc
  }, {})
  const currency    = Object.entries(_currencyCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "PHP"
  const incomeRows  = rows.filter(r => r.document_type === "payslip" || r.document_type === "income_statement")
  const expenseRows = rows.filter(r => r.document_type === "receipt"  || r.document_type === "invoice")

  const totalGross    = incomeRows.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalNet      = incomeRows.reduce((s, r) => s + (r.net_income ?? 0), 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const estimatedTaxable = totalGross - totalExpenses   // show actual — can be negative

  // Withholding = sum of (gross - net) where both fields known
  const totalWithholding = incomeRows.reduce((s, r) => {
    if (r.gross_income != null && r.net_income != null) {
      return s + Math.max(0, r.gross_income - r.net_income)
    }
    return s
  }, 0)

  // Group income by employer
  const incomeByEmployer = new Map<string, { gross: number; net: number; withholding: number; docs: number }>()
  for (const r of incomeRows) {
    const key = r.employer_name ?? "Unknown Employer"
    const existing = incomeByEmployer.get(key) ?? { gross: 0, net: 0, withholding: 0, docs: 0 }
    const gross = r.gross_income ?? r.total_amount ?? 0
    const net   = r.net_income ?? 0
    incomeByEmployer.set(key, {
      gross:       existing.gross + gross,
      net:         existing.net  + net,
      withholding: existing.withholding + (r.gross_income != null && r.net_income != null ? Math.max(0, gross - net) : 0),
      docs:        existing.docs + 1,
    })
  }

  // Group expenses by category
  const expenseByCategory = new Map<string, number>()
  for (const r of expenseRows) {
    const key = r.expense_category ?? "Uncategorized"
    expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + (r.total_amount ?? 0))
  }

  // Tax year from data
  const allDates = rows.map(r => r.document_date).filter(Boolean) as string[]
  const taxYear = allDates.length
    ? new Set(allDates.map(d => d.slice(0, 4))).size === 1
      ? allDates[0].slice(0, 4)
      : `${allDates.reduce((a, b) => a < b ? a : b).slice(0, 4)}–${allDates.reduce((a, b) => a > b ? a : b).slice(0, 4)}`
    : "—"

  const generatedDate = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" })
  const hasData = incomeRows.length > 0 || expenseRows.length > 0

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

          {/* Date filter */}
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
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-xs uppercase tracking-widest text-muted-foreground">
              Loading…
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center py-32 text-xs text-muted-foreground">
              No data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Report Header ── */}
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Tax Bundle Summary</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Tax Period: {taxYear}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span>Generated {generatedDate}</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      For reference only. Consult a licensed tax professional before filing. Not a certified BIR document.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 gap-2 rounded text-xs" disabled>
                    <Download className="h-3.5 w-3.5" />
                    Export PDF
                  </Button>
                </div>
              </div>

              {/* ── Summary Strip ── */}
              <div className="grid grid-cols-1 divide-y divide-border border border-border rounded sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  { label: "Gross Income",              value: fmt(totalGross, currency), loss: false },
                  { label: "Total Documented Expenses", value: fmt(totalExpenses, currency), loss: false },
                  {
                    label: "Est. Taxable Income",
                    value: estimatedTaxable >= 0
                      ? fmt(estimatedTaxable, currency)
                      : `(${fmt(Math.abs(estimatedTaxable), currency)})`,
                    loss: estimatedTaxable < 0,
                  },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                    <p className={`mt-1.5 font-mono text-base font-medium tabular-nums ${item.loss ? "text-destructive" : "text-foreground"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Income Summary ── */}
              {incomeRows.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Income Summary
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Employer / Source</th>
                        <th className="pb-2 text-right font-medium">Gross Income</th>
                        <th className="pb-2 text-right font-medium">Net Income</th>
                        <th className="pb-2 text-right font-medium">Tax Withheld</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Array.from(incomeByEmployer.entries()).map(([employer, data]) => (
                        <tr key={employer}>
                          <td className="py-2.5 text-foreground">{employer}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            {fmt(data.gross, currency)}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            {data.net > 0 ? fmt(data.net, currency) : "—"}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            {data.withholding > 0 ? fmt(data.withholding, currency) : "—"}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">{data.docs}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5 text-foreground">Total</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          {totalNet > 0 ? fmt(totalNet, currency) : "—"}
                        </td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          {totalWithholding > 0 ? fmt(totalWithholding, currency) : "—"}
                        </td>
                        <td className="pt-2.5 text-right text-muted-foreground">{incomeRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Expense Schedule ── */}
              {expenseRows.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Schedule of Expenses
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">% of Gross</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Array.from(expenseByCategory.entries()).map(([cat, amount]) => (
                        <tr key={cat}>
                          <td className="py-2.5 text-foreground">{cat}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            ({fmt(amount, currency)})
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {totalGross > 0 ? `${((amount / totalGross) * 100).toFixed(1)}%` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5 text-foreground">Total Expenses</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                        <td className="pt-2.5 text-right text-muted-foreground">
                          {totalGross > 0 ? `${((totalExpenses / totalGross) * 100).toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Tax Computation Box ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Tax Computation
                </p>
                <div className="rounded border border-border p-6">
                  <table className="w-full text-sm">
                    <colgroup>
                      <col />
                      <col style={{ width: "13rem" }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Gross Income</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Less: Documented Expenses</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="py-2 font-semibold text-foreground">Est. Taxable Income</td>
                        <td className={`py-2 text-right font-mono tabular-nums font-semibold ${estimatedTaxable < 0 ? "text-destructive" : "text-foreground"}`}>
                          {estimatedTaxable >= 0
                            ? fmt(estimatedTaxable, currency)
                            : `(${fmt(Math.abs(estimatedTaxable), currency)})`}
                        </td>
                      </tr>
                      {totalWithholding > 0 && (
                        <>
                          <tr><td colSpan={2} className="py-2" /></tr>
                          <tr>
                            <td className="py-1.5 text-foreground/80">Withholding Tax Credited</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                              ({fmt(totalWithholding, currency)})
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-4 text-[10px] text-muted-foreground/60">
                    Actual tax due depends on applicable deductions, exemptions, and BIR tax brackets.
                    This computation is an estimate for reference only.
                  </p>
                </div>
              </div>

              {/* ── Supporting Documents ── */}
              {rows.length > 0 && (
                <div className="border-t border-border pt-6">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Supporting Documents ({rows.length})
                  </p>
                  <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-2">
                    {incomeRows.map((r, i) => (
                      <div key={`inc-${i}`} className="flex items-baseline justify-between border-b border-border/40 py-1">
                        <span className="truncate text-xs text-muted-foreground">{r.employer_name ?? r.filename}</span>
                        <span className="ml-4 shrink-0 text-[10px] text-muted-foreground/50">
                          {r.document_date ? formatDate(r.document_date) : "—"}
                        </span>
                      </div>
                    ))}
                    {expenseRows.map((r, i) => (
                      <div key={`exp-${i}`} className="flex items-baseline justify-between border-b border-border/40 py-1">
                        <span className="truncate text-xs text-muted-foreground">{r.vendor_name ?? r.filename}</span>
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
                  This report is a reference summary based on uploaded documents. It is not tax advice and does not constitute an official BIR filing.
                  Estimated taxable income is calculated as gross income minus total documented expenses.
                  Withholding tax figures are derived from payslip gross/net differentials.
                  Consult a licensed tax professional for filing purposes.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
