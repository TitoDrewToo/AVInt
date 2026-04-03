"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download } from "lucide-react"
import Link from "next/link"

interface KeyTermsRow {
  filename: string
  document_type: string
  counterparty_name: string | null
  document_date: string | null
  period_start: string | null
  period_end: string | null
  invoice_number: string | null
  payment_method: string | null
  total_amount: number | null
  currency: string | null
  line_items: Array<{ description: string; amount: number; quantity: number | null }> | null
  confidence_score: number | null
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

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "..." : str
}

export default function KeyTermsPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [docs, setDocs] = useState<KeyTermsRow[]>([])
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

  const loadDocs = useCallback(async () => {
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
          payment_method,
          total_amount,
          currency,
          line_items,
          confidence_score,
          files!inner(filename, document_type)
        `)
        .in("file_id", fileIds)
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo) query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setDocs(data.map((row: any) => ({
          filename: row.files.filename,
          document_type: row.files.document_type,
          counterparty_name: row.counterparty_name,
          document_date: row.document_date,
          period_start: row.period_start,
          period_end: row.period_end,
          invoice_number: row.invoice_number,
          payment_method: row.payment_method,
          total_amount: row.total_amount != null ? parseFloat(row.total_amount) || 0 : null,
          currency: row.currency,
          line_items: row.line_items ?? null,
          confidence_score: row.confidence_score,
        })))
      }
    } catch (err) {
      console.error("loadDocs error:", err)
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  // Aggregations
  const uniqueCounterparties = new Set(
    docs.map((d) => d.counterparty_name).filter(Boolean)
  ).size

  const termsExtracted = docs.reduce((sum, d) => sum + (d.line_items?.length ?? 0), 0)

  const currencyCount = docs.reduce((acc: Record<string, number>, d) => {
    const cur = d.currency ?? "USD"
    acc[cur] = (acc[cur] ?? 0) + 1
    return acc
  }, {})
  const currency = Object.entries(currencyCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

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
                <h1 className="text-2xl font-semibold text-foreground">Key Terms</h1>
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
          ) : docs.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
              No contract or agreement documents found.
            </div>
          ) : (
            <div className="space-y-6">

              {/* KPI row */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Documents</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{docs.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Counterparties</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{uniqueCounterparties}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Terms Extracted</p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">{termsExtracted}</p>
                </div>
              </div>

              {/* Per-document cards */}
              <div className="space-y-4">
                {docs.map((doc, i) => (
                  <div key={i} className="rounded-xl border border-border bg-card p-6">
                    {/* Card header */}
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {truncate(doc.filename, 40)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {doc.document_date ? formatDate(doc.document_date) : "No date"}
                        </p>
                      </div>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-muted-foreground whitespace-nowrap">
                        {doc.document_type}
                      </span>
                    </div>

                    {/* Fields grid */}
                    <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Counterparty</p>
                        <p className="mt-0.5 text-foreground">{doc.counterparty_name ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Reference No</p>
                        <p className="mt-0.5 text-foreground">{doc.invoice_number ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Period Start</p>
                        <p className="mt-0.5 text-foreground">
                          {doc.period_start ? formatDate(doc.period_start) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Period End</p>
                        <p className="mt-0.5 text-foreground">
                          {doc.period_end ? formatDate(doc.period_end) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Payment Method</p>
                        <p className="mt-0.5 text-foreground">{doc.payment_method ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Amount</p>
                        <p className="mt-0.5 text-foreground">
                          {doc.total_amount != null
                            ? formatCurrency(doc.total_amount, doc.currency ?? currency)
                            : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Line items */}
                    {doc.line_items && doc.line_items.length > 0 && (
                      <div className="mt-2">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Line Items
                        </p>
                        <div className="overflow-x-auto rounded-lg border border-border">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <th className="px-4 pb-2 pt-3">Description</th>
                                <th className="px-4 pb-2 pt-3 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {doc.line_items.map((item, j) => (
                                <tr key={j}>
                                  <td className="px-4 py-2.5 text-foreground">{item.description}</td>
                                  <td className="px-4 py-2.5 text-right font-medium text-foreground">
                                    {formatCurrency(item.amount, doc.currency ?? currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
