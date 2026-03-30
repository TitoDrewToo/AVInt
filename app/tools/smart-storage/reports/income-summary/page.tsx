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

interface IncomeRow {
  filename: string
  document_type: string
  employer_name: string | null
  document_date: string | null
  gross_income: number | null
  net_income: number | null
  total_amount: number | null
  currency: string | null
  confidence_score: number | null
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

export default function IncomeSummaryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [income, setIncome] = useState<IncomeRow[]>([])
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

  const loadIncome = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)
      .in("document_type", ["payslip", "income_statement"])

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    let query = supabase
      .from("document_fields")
      .select(`
        file_id,
        employer_name,
        document_date,
        gross_income,
        net_income,
        total_amount,
        currency,
        confidence_score,
        files!inner(filename, document_type)
      `)
      .in("file_id", fileIds)
      .order("document_date", { ascending: false })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data } = await query

    if (data) {
      setIncome(data.map((row: any) => ({
        filename: row.files.filename,
        document_type: row.files.document_type,
        employer_name: row.employer_name,
        document_date: row.document_date,
        gross_income: row.gross_income ? parseFloat(row.gross_income) : null,
        net_income: row.net_income ? parseFloat(row.net_income) : null,
        total_amount: row.total_amount ? parseFloat(row.total_amount) : null,
        currency: row.currency,
        confidence_score: row.confidence_score,
      })))
    }
    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadIncome()
  }, [loadIncome])

  const _currencyCount = income[0].reduce((acc: Record<string, number>, r: any) => {
    const c = r.currency ?? "USD"; acc[c] = (acc[c] ?? 0) + 1; return acc
  }, {} as Record<string, number>)
  const currency = Object.entries(_currencyCount).sort(([,a],[,b]) => (b as number) - (a as number))[0]?.[0] ?? "USD"
  const totalGross = income.reduce((sum, r) => sum + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalNet = income.reduce((sum, r) => sum + (r.net_income ?? 0), 0)
  const avgMonthly = income.length > 0 ? totalGross / income.length : 0

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
                <h1 className="text-2xl font-semibold text-foreground">Income Summary</h1>
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
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading income data…</div>
          ) : income.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">No income data found for the selected period.</div>
          ) : (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Gross Income</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(totalGross, currency)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Net Income</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{totalNet > 0 ? formatCurrency(totalNet, currency) : "—"}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Avg Monthly</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{formatCurrency(avgMonthly, currency)}</p>
                </div>
              </div>

              {/* Income detail */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Income Detail</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Employer</th>
                        <th className="pb-3 pr-4">Type</th>
                        <th className="pb-3 pr-4 text-right">Gross</th>
                        <th className="pb-3 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {income.map((row, i) => (
                        <tr key={i}>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {row.document_date ? formatDate(row.document_date) : "—"}
                          </td>
                          <td className="py-3 pr-4 text-foreground">{row.employer_name ?? "—"}</td>
                          <td className="py-3 pr-4">
                            <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground">
                              {row.document_type}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-right font-medium text-foreground">
                            {formatCurrency(row.gross_income ?? row.total_amount ?? 0, row.currency ?? "PHP")}
                          </td>
                          <td className="py-3 text-right text-muted-foreground">
                            {row.net_income ? formatCurrency(row.net_income, row.currency ?? "PHP") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td colSpan={3} className="pt-3 text-sm font-semibold text-foreground">Total</td>
                        <td className="pt-3 text-right text-sm font-semibold text-foreground">{formatCurrency(totalGross, currency)}</td>
                        <td className="pt-3 text-right text-sm font-semibold text-foreground">{totalNet > 0 ? formatCurrency(totalNet, currency) : "—"}</td>
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
