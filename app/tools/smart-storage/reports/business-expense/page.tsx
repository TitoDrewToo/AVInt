"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

// ── Constants ──────────────────────────────────────────────────────────────────

const BUSINESS_CATEGORIES = ["Office", "Travel", "Legal", "Transport", "Tax"]

// ── Types ──────────────────────────────────────────────────────────────────────

interface BizExpenseRow {
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

export default function BusinessExpensePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [expenses, setExpenses] = useState<BizExpenseRow[]>([])
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
      .then(({ data }) => setIsPro(data?.status === "pro" || data?.status === "day_pass"))
  }, [session])

  const loadExpenses = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    try {
      const { data: userFiles } = await supabase
        .from("files")
        .select("id")
        .eq("user_id", session.user.id)
        .in("document_type", ["receipt", "invoice"])

      if (!userFiles?.length) return

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
        setExpenses(data.map((row: any) => {
          const expense_category = row.expense_category ?? null
          return {
            filename:         row.files.filename,
            document_type:    row.files.document_type,
            vendor_name:      row.vendor_name,
            document_date:    row.document_date,
            total_amount:     row.total_amount  != null ? parseFloat(row.total_amount)  || 0 : 0,
            currency:         row.currency,
            expense_category,
            payment_method:   row.payment_method,
            tax_amount:       row.tax_amount != null ? parseFloat(row.tax_amount) || 0 : null,
            confidence_score: row.confidence_score,
            isBusiness:       BUSINESS_CATEGORIES.includes(expense_category ?? ""),
          }
        }))
      }
    } catch (err) {
      console.error("loadExpenses error:", err)
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadExpenses() }, [loadExpenses])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const _cc = expenses.reduce((acc: Record<string, number>, e) => {
    const c = e.currency ?? "PHP"; acc[c] = (acc[c] ?? 0) + 1; return acc
  }, {})
  const currency = Object.entries(_cc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "PHP"

  const businessRows = expenses.filter(e => e.isBusiness)
  const personalRows = expenses.filter(e => !e.isBusiness)

  const totalBusiness = businessRows.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const totalPersonal = personalRows.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const totalAll      = totalBusiness + totalPersonal
  const businessPct   = totalAll > 0 ? (totalBusiness / totalAll) * 100 : 0

  // Group by category for each segment
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
  const personalByCategory = groupByCategory(personalRows)

  const allDates = expenses.map(e => e.document_date).filter(Boolean) as string[]
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
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Business vs Personal Expenses</h1>
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
                  <Button variant="outline" size="sm" className="shrink-0 gap-2 rounded text-xs" disabled>
                    <Download className="h-3.5 w-3.5" />
                    Export PDF
                  </Button>
                </div>
              </div>

              {/* ── Summary Strip ── */}
              <div className="grid grid-cols-2 divide-x divide-border border border-border rounded sm:grid-cols-4">
                {[
                  { label: "Total Business",  value: fmt(totalBusiness, currency) },
                  { label: "Total Personal",  value: fmt(totalPersonal, currency) },
                  { label: "Total All",        value: fmt(totalAll, currency) },
                  { label: "Business %",       value: `${businessPct.toFixed(1)}%` },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Business Expenses ── */}
              {businessRows.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Business Expenses ({businessRows.length} documents)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">% of Business</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {businessByCategory.map(cat => (
                        <tr key={cat.category}>
                          <td className="py-2.5 text-foreground">{cat.category}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            ({fmt(cat.total, currency)})
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {totalBusiness > 0 ? `${((cat.total / totalBusiness) * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">{cat.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5 text-foreground">Total Business</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">({fmt(totalBusiness, currency)})</td>
                        <td className="pt-2.5 text-right text-muted-foreground">100%</td>
                        <td className="pt-2.5 text-right text-muted-foreground">{businessRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Personal Expenses ── */}
              {personalRows.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Personal Expenses ({personalRows.length} documents)
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">% of Personal</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {personalByCategory.map(cat => (
                        <tr key={cat.category}>
                          <td className="py-2.5 text-foreground">{cat.category}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            ({fmt(cat.total, currency)})
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">
                            {totalPersonal > 0 ? `${((cat.total / totalPersonal) * 100).toFixed(1)}%` : "—"}
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">{cat.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5 text-foreground">Total Personal</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">({fmt(totalPersonal, currency)})</td>
                        <td className="pt-2.5 text-right text-muted-foreground">100%</td>
                        <td className="pt-2.5 text-right text-muted-foreground">{personalRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Full Transaction Detail ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Full Transaction Detail
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Vendor</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium">Classification</th>
                      <th className="pb-2 font-medium">Payment</th>
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
                        <td className="py-2 text-muted-foreground">
                          {row.isBusiness ? "Business" : "Personal"}
                        </td>
                        <td className="py-2 text-muted-foreground">{row.payment_method ?? "—"}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {row.total_amount != null ? `(${fmt(row.total_amount, row.currency ?? currency)})` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td colSpan={5} className="pt-2 text-foreground">Total</td>
                      <td className="pt-2 text-right font-mono tabular-nums text-foreground">
                        ({fmt(totalAll, currency)})
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Classification Note ── */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  Business classification is based on expense category: {BUSINESS_CATEGORIES.join(", ")}.
                  Categories are extracted by AI from uploaded receipts and invoices.
                  Review individual transactions to confirm classification accuracy.
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
