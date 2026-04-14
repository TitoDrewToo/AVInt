"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download, FolderOpen, Printer } from "lucide-react"
import Link from "next/link"

interface FolderOption { id: string; name: string }

interface KeyTermsRow {
  id: string
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

function fmt(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + "…" : str
}

function daysUntil(dateStr: string) {
  const target = new Date(dateStr + "T00:00:00")
  const now = new Date()
  now.setHours(0, 0, 0, 0) // normalize to local midnight for consistent day count
  const ms = target.getTime() - now.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

export default function KeyTermsPage() {
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro }               = useEntitlement(session)
  const [docs, setDocs]                   = useState<KeyTermsRow[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [dateFrom, setDateFrom]           = useState("")
  const [dateTo, setDateTo]               = useState("")
  const [folders, setFolders]             = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder]   = useState("")

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
    supabase.from("folders").select("id, name").eq("user_id", session.user.id).order("name")
      .then(({ data }) => { if (data) setFolders(data) })
  }, [session])

  const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

  const loadDocs = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    try {
      let filesQuery = supabase
        .from("files")
        .select("id")
        .eq("user_id", session.user.id)
        .in("document_type", ["contract", "agreement"])
      if (targetFolder) filesQuery = filesQuery.eq("folder_id", targetFolder)
      const { data: userFiles } = await filesQuery

      if (!userFiles?.length) { setLoading(false); return }

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
          id:                row.file_id,
          filename:          row.files?.filename ?? "unknown",
          document_type:     row.files?.document_type ?? "unknown",
          counterparty_name: row.counterparty_name,
          document_date:     row.document_date,
          period_start:      row.period_start,
          period_end:        row.period_end,
          invoice_number:    row.invoice_number,
          payment_method:    row.payment_method,
          total_amount:      row.total_amount != null ? safeNum(row.total_amount) : null,
          currency:          row.currency,
          line_items:        row.line_items ?? null,
          confidence_score:  row.confidence_score,
        })))
      }
    } catch (err) {
      console.error("loadDocs error:", err)
      setError("Failed to load key terms data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => {
    loadDocs()
  }, [loadDocs])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const uniqueCounterparties = new Set(
    docs.map((d) => d.counterparty_name).filter(Boolean)
  ).size

  const termsExtracted = docs.reduce((sum, d) => sum + (d.line_items?.length ?? 0), 0)

  const totalContractValue = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0)

  const _cc = docs.reduce((acc: Record<string, number>, d) => {
    const c = d.currency ?? "USD"; acc[c] = (acc[c] ?? 0) + Math.abs(d.total_amount ?? 0); return acc
  }, {})
  const currency = Object.entries(_cc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

  // Expiring within 90 days
  const expiringSoon = docs.filter(d => {
    if (!d.period_end) return false
    const days = daysUntil(d.period_end)
    return days >= 0 && days <= 90
  }).sort((a, b) => daysUntil(a.period_end!) - daysUntil(b.period_end!))

  // By counterparty rollup
  const counterpartyMap: Record<string, { count: number; total: number }> = {}
  for (const d of docs) {
    const cp = d.counterparty_name ?? "Unknown"
    if (!counterpartyMap[cp]) counterpartyMap[cp] = { count: 0, total: 0 }
    counterpartyMap[cp].count += 1
    counterpartyMap[cp].total += d.total_amount ?? 0
  }
  const counterpartyRollup = Object.entries(counterpartyMap)
    .sort(([, a], [, b]) => b.total - a.total)

  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })

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
          <div className="mb-8 flex items-center gap-3">
            <Link href="/tools/smart-storage">
              <button className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link>
            <span className="text-xs text-muted-foreground">Smart Storage / Reports</span>
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
                Generated {generatedDate}
              </p>
            </div>
            <div className="print:hidden">
              <Button variant="outline" size="sm" className="rounded-md gap-2 text-xs" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />
                Print / PDF
              </Button>
            </div>
          </div>

          {/* Filters */}
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

            <span className="mx-1 h-4 w-px bg-border" />

            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Source</span>
            <div className="relative">
              <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select
                value={targetFolder}
                onChange={e => setTargetFolder(e.target.value)}
                className="appearance-none rounded border border-border bg-background py-1 pl-7 pr-6 text-xs text-foreground"
              >
                <option value="">All data</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-24 text-xs text-red-500">
              {error}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              No contract or agreement documents found.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Summary Strip ── */}
              <div className="grid grid-cols-2 divide-x divide-border border border-border sm:grid-cols-4">
                {[
                  { label: "Documents",           value: String(docs.length) },
                  { label: "Counterparties",       value: String(uniqueCounterparties) },
                  { label: "Terms Extracted",      value: String(termsExtracted) },
                  { label: "Total Contract Value", value: totalContractValue > 0 ? fmt(totalContractValue, currency) : "—" },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Expiring Soon ── */}
              {expiringSoon.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Expiring Within 90 Days
                  </p>
                  <div className="divide-y divide-border border border-border">
                    {expiringSoon.map((doc) => {
                      const days = daysUntil(doc.period_end!)
                      return (
                        <div key={doc.id} className="flex items-center justify-between px-5 py-3">
                          <div>
                            <p className="text-xs text-foreground">{truncate(doc.filename, 50)}</p>
                            {doc.counterparty_name && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{doc.counterparty_name}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className={`font-mono text-xs tabular-nums ${days <= 14 ? "text-red-500 dark:text-red-400" : days <= 30 ? "text-amber-500 dark:text-amber-400" : "text-muted-foreground"}`}>
                              {days === 0 ? "Expires today" : `${days}d left`}
                            </p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">
                              {formatDate(doc.period_end!)}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Contracts Overview ── */}
              <div>
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Contracts Overview
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
                      <th className="pb-2 font-medium">Document</th>
                      <th className="pb-2 font-medium">Counterparty</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 text-right font-medium">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {docs.map((doc) => (
                      <tr key={doc.id}>
                        <td className="py-2 text-foreground">{truncate(doc.filename, 36)}</td>
                        <td className="py-2 text-muted-foreground">{doc.counterparty_name ?? "—"}</td>
                        <td className="py-2 text-muted-foreground">
                          {doc.document_date ? formatDate(doc.document_date) : "—"}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {doc.total_amount != null ? fmt(doc.total_amount, doc.currency ?? currency) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totalContractValue > 0 && (
                    <tfoot>
                      <tr className="border-t border-border font-medium">
                        <td colSpan={3} className="pt-2 text-foreground">Total</td>
                        <td className="pt-2 text-right font-mono tabular-nums text-foreground">
                          {fmt(totalContractValue, currency)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* ── By Counterparty ── */}
              {counterpartyRollup.length > 1 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    By Counterparty
                  </p>
                  <div className="divide-y divide-border border border-border">
                    {counterpartyRollup.map(([cp, { count, total }]) => (
                      <div key={cp} className="flex items-center justify-between px-5 py-3">
                        <div>
                          <p className="text-xs text-foreground">{cp}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {count} {count === 1 ? "contract" : "contracts"}
                          </p>
                        </div>
                        <span className="font-mono text-xs tabular-nums text-foreground">
                          {total > 0 ? fmt(total, currency) : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Per-document Detail ── */}
              <div>
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Document Terms
                </p>
                <div className="divide-y divide-border border border-border">
                  {docs.map((doc) => (
                    <div key={doc.id} className="px-6 py-5">

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
                                ? fmt(doc.total_amount, doc.currency ?? currency)
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
                                    {fmt(item.amount, doc.currency ?? currency)}
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
