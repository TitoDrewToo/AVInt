"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

const BUSINESS_CATEGORIES = ["Office", "Travel", "Legal", "Transport", "Tax"]

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

interface CategorySummary {
  category: string
  total: number
  count: number
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function buildCategorySummary(rows: BizExpenseRow[]): CategorySummary[] {
  return Object.values(
    rows.reduce((acc: Record<string, CategorySummary>, row) => {
      const cat = row.expense_category ?? "Uncategorized"
      if (!acc[cat]) acc[cat] = { category: cat, total: 0, count: 0 }
      acc[cat].total += row.total_amount ?? 0
      acc[cat].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)
}

export default function BusinessExpensePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
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

  const loadExpenses = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)
      .in("document_type", ["receipt", "invoice"])

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    let query = supabase
      .from("document_fields")
      .select(`
        file_id,
        vendor_name,
        document_date,
        total_amount,
        currency,
        expense_category,
        payment_method,
        tax_amount,
        confidence_score,
        files!inner(filename, document_type)
      `)
      .in("file_id", fileIds)
      .order("document_date", { ascending: false })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data } = await query

    if (data) {
      setExpenses(data.map((row: any) => {
        const expense_category = row.expense_category ?? null
        return {
          filename: row.files.filename,
          document_type: row.files.document_type,
          vendor_name: row.vendor_name,
          document_date: row.document_date,
          total_amount: row.total_amount != null ? parseFloat(row.total_amount) || 0 : 0,
          currency: row.currency,
          expense_category,
          payment_method: row.payment_method,
          tax_amount: row.tax_amount != null ? parseFloat(row.tax_amount) || 0 : null,
          confidence_score: row.confidence_score,
          // Intentional: null expense_category fails BUSINESS_CATEGORIES.includes check, so uncategorized expenses default to personal
          isBusiness: BUSINESS_CATEGORIES.includes(expense_category ?? ""),
        }
      }))
    }
    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Aggregations
  const businessRows = expenses.filter((e) => e.isBusiness)
  const personalRows = expenses.filter((e) => !e.isBusiness)

  const totalBusiness = businessRows.reduce((sum, e) => sum + (e.total_amount ?? 0), 0)
  const totalPersonal = personalRows.reduce((sum, e) => sum + (e.total_amount ?? 0), 0)
  const totalAll = totalBusiness + totalPersonal

  const currencyCount = expenses.reduce((acc: Record<string, number>, e) => {
    const c = e.currency ?? "USD"
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})
  const currency = Object.entries(currencyCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

  const businessByCategory = buildCategorySummary(businessRows)
  const personalByCategory = buildCategorySummary(personalRows)

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
                <h1 className="text-2xl font-semibold text-foreground">Business vs Personal Expenses</h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Generated {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" })}
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
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground"
            />
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg"
              onClick={() => { setDateFrom(""); setDateTo("") }}
            >
              Clear
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              No expense data found for the selected period.
            </div>
          ) : (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Business</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalBusiness, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Personal</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalPersonal, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Business %</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {totalAll > 0 ? ((totalBusiness / totalAll) * 100).toFixed(1) : 0}%
                  </p>
                </div>
              </div>

              {/* Business Expenses by category */}
              {businessRows.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Business Expenses</h2>
                  <div className="space-y-3">
                    {businessByCategory.map((cat) => (
                      <div key={cat.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-foreground">{cat.category}</span>
                          <span className="font-medium text-foreground">{formatCurrency(cat.total, currency)}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${totalBusiness > 0 ? (cat.total / totalBusiness) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {cat.count} document{cat.count > 1 ? "s" : ""} · {totalBusiness > 0 ? ((cat.total / totalBusiness) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Personal Expenses by category */}
              {personalRows.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Personal Expenses</h2>
                  <div className="space-y-3">
                    {personalByCategory.map((cat) => (
                      <div key={cat.category}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-foreground">{cat.category}</span>
                          <span className="font-medium text-foreground">{formatCurrency(cat.total, currency)}</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full bg-primary"
                            style={{ width: `${totalPersonal > 0 ? (cat.total / totalPersonal) * 100 : 0}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {cat.count} document{cat.count > 1 ? "s" : ""} · {totalPersonal > 0 ? ((cat.total / totalPersonal) * 100).toFixed(1) : 0}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Transaction Detail */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Full Transaction Detail</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Vendor</th>
                        <th className="pb-3 pr-4">Category</th>
                        <th className="pb-3 pr-4">Type</th>
                        <th className="pb-3 pr-4">Payment</th>
                        <th className="pb-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {expenses.map((row, i) => (
                        <tr key={i}>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {row.document_date ? formatDate(row.document_date) : "—"}
                          </td>
                          <td className="py-3 pr-4 text-foreground">{row.vendor_name ?? "—"}</td>
                          <td className="py-3 pr-4 text-muted-foreground">{row.expense_category ?? "—"}</td>
                          <td className="py-3 pr-4">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.isBusiness
                                  ? "border border-border text-foreground bg-muted"
                                  : "border border-border text-muted-foreground"
                              }`}
                            >
                              {row.isBusiness ? "Business" : "Personal"}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">{row.payment_method ?? "—"}</td>
                          <td className="py-3 text-right font-medium text-foreground">
                            {row.total_amount != null
                              ? formatCurrency(row.total_amount, row.currency ?? currency)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={5} className="pt-3 text-sm font-semibold text-foreground">Total</td>
                        <td className="pt-3 text-right text-sm font-semibold text-foreground">
                          {formatCurrency(totalAll, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
