"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

interface ContractRow {
  filename: string
  document_type: string
  counterparty_name: string | null
  document_date: string | null
  period_start: string | null
  period_end: string | null
  invoice_number: string | null
  total_amount: number | null
  currency: string | null
  payment_method: string | null
  confidence_score: number | null
}

interface CounterpartySummary {
  name: string
  count: number
  total: number
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

export default function ContractSummaryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [contracts, setContracts] = useState<ContractRow[]>([])
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

  const loadContracts = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    try {
      const { data: userFiles } = await supabase
        .from("files")
        .select("id")
        .eq("user_id", session.user.id)
        .in("document_type", ["contract", "agreement"])

      if (!userFiles?.length) return

      const fileIds = userFiles.map((f) => f.id)

      let query = supabase
        .from("document_fields")
        .select(`
          file_id,
          counterparty_name,
          document_date,
          period_start,
          period_end,
          invoice_number,
          total_amount,
          currency,
          payment_method,
          confidence_score,
          files!inner(filename, document_type)
        `)
        .in("file_id", fileIds)
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo) query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setContracts(data.map((row: any) => ({
          filename: row.files.filename,
          document_type: row.files.document_type,
          counterparty_name: row.counterparty_name,
          document_date: row.document_date,
          period_start: row.period_start,
          period_end: row.period_end,
          invoice_number: row.invoice_number,
          total_amount: row.total_amount != null ? parseFloat(row.total_amount) || 0 : null,
          currency: row.currency,
          payment_method: row.payment_method,
          confidence_score: row.confidence_score,
        })))
      }
    } catch (err) {
      console.error("loadContracts error:", err)
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadContracts()
  }, [loadContracts])

  // Aggregations
  const today = new Date().toISOString().split("T")[0]

  const uniqueCounterparties = new Set(
    contracts.map((c) => c.counterparty_name).filter(Boolean)
  ).size

  const activeCount = contracts.filter(
    (c) => c.period_end == null || c.period_end >= today
  ).length

  const currencyCount = contracts.reduce((acc: Record<string, number>, c) => {
    const cur = c.currency ?? "USD"
    acc[cur] = (acc[cur] ?? 0) + 1
    return acc
  }, {})
  const currency = Object.entries(currencyCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

  const byCounterparty: CounterpartySummary[] = Object.values(
    contracts.reduce((acc: Record<string, CounterpartySummary>, row) => {
      const name = row.counterparty_name ?? "Unknown"
      if (!acc[name]) acc[name] = { name, count: 0, total: 0 }
      acc[name].count += 1
      acc[name].total += row.total_amount ?? 0
      return acc
    }, {})
  ).sort((a, b) => b.count - a.count)

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
                <h1 className="text-2xl font-semibold text-foreground">Contract Summary</h1>
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
          ) : contracts.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              No contract or agreement documents found.
            </div>
          ) : (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Contracts</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{contracts.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Counterparties</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{uniqueCounterparties}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Active</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{activeCount}</p>
                </div>
              </div>

              {/* By Counterparty */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">By Counterparty</h2>
                <div className="divide-y divide-border">
                  {byCounterparty.map((cp) => (
                    <div key={cp.name} className="flex items-center justify-between py-3">
                      <span className="text-sm text-foreground">{cp.name}</span>
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">
                          {cp.total > 0 ? formatCurrency(cp.total, currency) : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cp.count} contract{cp.count > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Contract Detail */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold text-foreground">Contract Detail</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        <th className="pb-3 pr-4">Date</th>
                        <th className="pb-3 pr-4">Counterparty</th>
                        <th className="pb-3 pr-4">Ref No</th>
                        <th className="pb-3 pr-4">Period</th>
                        <th className="pb-3 text-right">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {contracts.map((row, i) => {
                        const periodStart = row.period_start ? formatDate(row.period_start) : null
                        const periodEnd = row.period_end ? formatDate(row.period_end) : null
                        const period =
                          periodStart && periodEnd
                            ? `${periodStart} → ${periodEnd}`
                            : periodStart
                            ? `${periodStart} →`
                            : periodEnd
                            ? `→ ${periodEnd}`
                            : "—"
                        return (
                          <tr key={i}>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {row.document_date ? formatDate(row.document_date) : "—"}
                            </td>
                            <td className="py-3 pr-4 text-foreground">
                              {row.counterparty_name ?? "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground">
                              {row.invoice_number ?? "—"}
                            </td>
                            <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">
                              {period}
                            </td>
                            <td className="py-3 text-right font-medium text-foreground">
                              {row.total_amount != null
                                ? formatCurrency(row.total_amount, row.currency ?? currency)
                                : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
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
