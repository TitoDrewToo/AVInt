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
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str
}

export default function KeyTermsPage() {
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro]                 = useState(false)
  const [docs, setDocs]                   = useState<KeyTermsRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [dateFrom, setDateFrom]           = useState("")
  const [dateTo, setDateTo]               = useState("")

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
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setDocs(data.map((row: any) => ({
          filename:          row.files.filename,
          document_type:     row.files.document_type,
          counterparty_name: row.counterparty_name,
          document_date:     row.document_date,
          period_start:      row.period_start,
          period_end:        row.period_end,
          invoice_number:    row.invoice_number,
          payment_method:    row.payment_method,
          total_amount:      row.total_amount != null ? parseFloat(row.total_amount) || 0 : null,
          currency:          row.currency,
          line_items:        row.line_items ?? null,
          confidence_score:  row.confidence_score,
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
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">

          {/* Back nav */}
          <div className="mb-8">
            <Link
              href="/tools/smart-storage"
              className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Smart Storage
            </Link>
          </div>

          {/* Report header */}
          <div className="mb-8 flex items-start justify-between">
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                AVINTELLIGENCE · Smart Storage
              </p>
              <h1 className="text-2xl font-light tracking-tight text-foreground">
                Key Terms
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Generated {new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "2-digit" })}
              </p>
            </div>
            <Button variant="outline" size="sm" className="rounded-md gap-2 text-xs" disabled>
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </Button>
          </div>

          {/* Date filter */}
          <div className="mb-8 flex items-center gap-3 border-y border-border py-3">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Period</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-border bg-background px-2.5 py-1 text-xs text-foreground"
            />
            <button
              onClick={() => { setDateFrom(""); setDateTo("") }}
              className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : docs.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              No contract or agreement documents found.
            </div>
          ) : (
            <div className="space-y-10">

              {/* Summary strip */}
              <div className="grid grid-cols-3 divide-x divide-border border border-border">
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Documents</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{docs.length}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Counterparties</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{uniqueCounterparties}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Terms Extracted</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{termsExtracted}</p>
                </div>
              </div>

              {/* Per-document records */}
              <div>
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Document Terms
                </p>
                <div className="divide-y divide-border border border-border">
                  {docs.map((doc, i) => (
                    <div key={i} className="px-6 py-5">

                      {/* Document header */}
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {truncate(doc.filename, 60)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {doc.document_date ? formatDate(doc.document_date) : "No date"}
                            {doc.counterparty_name && (
                              <span className="ml-3 text-muted-foreground/70">· {doc.counterparty_name}</span>
                            )}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
                          {doc.document_type}
                        </span>
                      </div>

                      {/* Fields table */}
                      <table className="w-full text-xs">
                        <tbody className="divide-y divide-border/40">
                          <tr>
                            <td className="py-1.5 pr-8 text-[10px] uppercase tracking-[0.1em] text-muted-foreground w-32">
                              Reference No
                            </td>
                            <td className="py-1.5 font-mono tabular-nums text-foreground">
                              {doc.invoice_number ?? "—"}
                            </td>
                            <td className="py-1.5 pr-8 pl-10 text-[10px] uppercase tracking-[0.1em] text-muted-foreground w-32">
                              Payment Method
                            </td>
                            <td className="py-1.5 text-foreground">
                              {doc.payment_method ?? "—"}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-8 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              Period Start
                            </td>
                            <td className="py-1.5 font-mono tabular-nums text-foreground">
                              {doc.period_start ? formatDate(doc.period_start) : "—"}
                            </td>
                            <td className="py-1.5 pr-8 pl-10 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              Period End
                            </td>
                            <td className="py-1.5 font-mono tabular-nums text-foreground">
                              {doc.period_end ? formatDate(doc.period_end) : "—"}
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pr-8 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                              Amount
                            </td>
                            <td className="py-1.5 font-mono tabular-nums text-foreground" colSpan={3}>
                              {doc.total_amount != null
                                ? formatCurrency(doc.total_amount, doc.currency ?? currency)
                                : "—"}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Line items */}
                      {doc.line_items && doc.line_items.length > 0 && (
                        <div className="mt-4 border-t border-border pt-4">
                          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                            Line Items
                          </p>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border/60">
                                <th className="pb-1.5 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">
                                  Description
                                </th>
                                <th className="pb-1.5 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">
                                  Amount
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {doc.line_items.map((item, j) => (
                                <tr key={j}>
                                  <td className="py-1.5 text-foreground">{item.description}</td>
                                  <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                                    {formatCurrency(item.amount, doc.currency ?? currency)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </div>

              {/* Disclaimer */}
              <p className="border-t border-border pt-6 text-[10px] leading-relaxed text-muted-foreground/60">
                Key terms are extracted by AI from uploaded documents. Always verify against original contracts. Not legal advice.
              </p>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
