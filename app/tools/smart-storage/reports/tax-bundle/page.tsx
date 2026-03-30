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

export default function TaxBundlePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
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

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const { data: userFiles } = await supabase
      .from("files")
      .select("id, document_type")
      .eq("user_id", session.user.id)

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    let query = supabase
      .from("document_fields")
      .select(`
        file_id,
        vendor_name,
        employer_name,
        document_date,
        total_amount,
        gross_income,
        net_income,
        expense_category,
        currency,
        files!inner(filename, document_type)
      `)
      .in("file_id", fileIds)
      .order("document_date", { ascending: false })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data } = await query

    if (data) {
      setRows(data.map((row: any) => ({
        filename: row.files.filename,
        document_type: row.files.document_type,
        vendor_name: row.vendor_name,
        employer_name: row.employer_name,
        document_date: row.document_date,
        total_amount: row.total_amount ? parseFloat(row.total_amount) : null,
        gross_income: row.gross_income ? parseFloat(row.gross_income) : null,
        net_income: row.net_income ? parseFloat(row.net_income) : null,
        expense_category: row.expense_category,
        currency: row.currency,
      })))
    }
    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadData()
  }, [loadData])

  const _currencyCount = rows.reduce((acc: Record<string, number>, r) => {
    const c = r.currency ?? "USD"; acc[c] = (acc[c] ?? 0) + 1; return acc
  }, {} as Record<string, number>)
  const currency = Object.entries(_currencyCount).sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0] ?? "USD"
  const incomeRows = rows.filter(r => r.document_type === "payslip" || r.document_type === "income_statement")
  const expenseRows = rows.filter(r => r.document_type === "receipt" || r.document_type === "invoice")

  const totalGross = incomeRows.reduce((sum, r) => sum + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalNet = incomeRows.reduce((sum, r) => sum + (r.net_income ?? 0), 0)
  const totalExpenses = expenseRows.reduce((sum, r) => sum + (r.total_amount ?? 0), 0)
  const estimatedTaxable = totalGross - totalExpenses

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
                <h1 className="text-2xl font-semibold text-foreground">Tax Bundle Summary</h1>
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
            <Button size="sm" variant="outline" className="rounded-lg" onClick={() => { setDateFrom(""); setDateTo("") }}>
              Clear
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading tax data…</div>
          ) : rows.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">No data found for the selected period.</div>
          ) : (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Gross Income</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(totalGross, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expenses</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(totalExpenses, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Income</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{totalNet > 0 ? formatCurrency(totalNet, currency) : "—"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Est. Taxable</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{formatCurrency(Math.max(0, estimatedTaxable), currency)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Gross minus expenses</p>
                </div>
              </div>

              {/* Income breakdown */}
              {incomeRows.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Income Documents</h2>
                  <div className="divide-y divide-border">
                    {incomeRows.map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm text-foreground">{row.employer_name ?? row.filename}</p>
                          <p className="text-xs text-muted-foreground capitalize">{row.document_type} · {row.document_date ? formatDate(row.document_date) : "—"}</p>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {formatCurrency(row.gross_income ?? row.total_amount ?? 0, row.currency ?? currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Expense breakdown */}
              {expenseRows.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Expense Documents</h2>
                  <div className="divide-y divide-border">
                    {expenseRows.map((row, i) => (
                      <div key={i} className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm text-foreground">{row.vendor_name ?? row.filename}</p>
                          <p className="text-xs text-muted-foreground capitalize">{row.document_type} · {row.expense_category ?? "—"} · {row.document_date ? formatDate(row.document_date) : "—"}</p>
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {formatCurrency(row.total_amount ?? 0, row.currency ?? currency)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary note */}
              <div className="rounded-xl border border-border bg-muted/30 p-5">
                <p className="text-xs text-muted-foreground">
                  This report is a reference summary based on uploaded documents. It is not tax advice. 
                  Estimated taxable amount is calculated as gross income minus total documented expenses. 
                  Consult a tax professional for filing purposes.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  )
}
