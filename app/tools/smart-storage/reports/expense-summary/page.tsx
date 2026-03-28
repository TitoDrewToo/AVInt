"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

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

interface CategorySummary {
  category: string
  total: number
  count: number
}

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: currency || "PHP",
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

export default function ExpenseSummaryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
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

    // Get user's files
    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)
      .in("document_type", ["receipt", "invoice"])

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    // Build query
    let query = supabase
      .from("document_fields")
      .select(`
        file_id,
        vendor_name,
        document_date,
        total_amount,
        currency,
        expense_category,
        confidence_score,
        files!inner(filename, document_type)
      `)
      .in("file_id", fileIds)
      .order("document_date", { ascending: false })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data } = await query

    if (data) {
      setExpenses(data.map((row: any) => ({
        filename: row.files.filename,
        document_type: row.files.document_type,
        vendor_name: row.vendor_name,
        document_date: row.document_date,
        total_amount: parseFloat(row.total_amount),
        currency: row.currency,
        expense_category: row.expense_category,
        confidence_score: row.confidence_score,
      })))
    }
    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  // Aggregations
  const totalExpenses = expenses.reduce((sum, e) => sum + (e.total_amount ?? 0), 0)
  const currency = expenses[0]?.currency ?? "PHP"

  const byCategory: CategorySummary[] = Object.values(
    expenses.reduce((acc: Record<string, CategorySummary>, row) => {
      const cat = row.expense_category ?? "Uncategorized"
      if (!acc[cat]) acc[cat] = { category: cat, total: 0, count: 0 }
      acc[cat].total += row.total_amount ?? 0
      acc[cat].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  const byVendor = Object.values(
    expenses.reduce((acc: Record<string, CategorySummary>, row) => {
      const vendor = row.vendor_name ?? "Unknown"
      if (!acc[vendor]) acc[vendor] = { category: vendor, total: 0, count: 0 }
      acc[vendor].total += row.total_amount ?? 0
      acc[vendor].count += 1
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

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
                <h1 className="text-2xl font-semibold text-foreground">Expense Summary</h1>
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
              Loading expenses…
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
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expenses</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalExpenses, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Documents</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{expenses.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Categories</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{byCategory.length}</p>
                </div>
              </div>

              {/* By category */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">By Category</h2>
                <div className="space-y-3">
                  {byCategory.map((cat) => (
                    <div key={cat.category}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-foreground">{cat.category}</span>
                        <span className="font-medium text-foreground">{formatCurrency(cat.total, currency)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${(cat.total / totalExpenses) * 100}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{cat.count} document{cat.count > 1 ? "s" : ""} · {((cat.total / totalExpenses) * 100).toFixed(1)}%</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* By vendor */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">By Vendor</h2>
                <div className="divide-y divide-border">
                  {byVendor.map((v) => (
                    <div key={v.category} className="flex items-center justify-between py-3">
                      <span className="text-sm text-foreground">{v.category}</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{formatCurrency(v.total, currency)}</p>
                        <p className="text-xs text-muted-foreground">{v.count} document{v.count > 1 ? "s" : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Transaction detail */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Transaction Detail</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Vendor</th>
                        <th className="pb-3 pr-4">Category</th>
                        <th className="pb-3 pr-4">Type</th>
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
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                              {row.document_type}
                            </span>
                          </td>
                          <td className="py-3 text-right font-medium text-foreground">
                            {row.total_amount != null ? formatCurrency(row.total_amount, row.currency ?? "PHP") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={4} className="pt-3 text-sm font-semibold text-foreground">Total</td>
                        <td className="pt-3 text-right text-sm font-semibold text-foreground">
                          {formatCurrency(totalExpenses, currency)}
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
      <Footer />
    </div>
  )
}
