"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import { ArrowLeft, Download, ChevronDown, ChevronUp, RefreshCw, FolderOpen, Printer } from "lucide-react"
import Link from "next/link"

interface FolderOption { id: string; name: string }

// ── Types ────────────────────────────────────────────────────────────────────

interface ContractRow {
  file_id: string
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

interface PaymentObligation {
  id: string
  file_id: string
  counterparty_name: string | null
  description: string | null
  amount: number | null
  currency: string | null
  due_date: string
  status: "pending" | "paid" | "disputed"
  paid_at: string | null
  paid_via: string | null
  notes: string | null
  check_number: string | null
  bank_name: string | null
}

interface MarkPaidForm {
  obligationId: string
  paid_at: string
  paid_via: string
}

type ObligationDisplay = "paid" | "overdue" | "upcoming" | "disputed"

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(amount: number, currency: string) {
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

function obligationStatus(o: PaymentObligation, today: string): ObligationDisplay {
  if (o.status === "paid")     return "paid"
  if (o.status === "disputed") return "disputed"
  return o.due_date < today ? "overdue" : "upcoming"
}

function StatusBadge({ status }: { status: ObligationDisplay }) {
  const styles: Record<ObligationDisplay, string> = {
    paid:     "text-emerald-600 dark:text-emerald-400",
    overdue:  "text-red-600 dark:text-red-400",
    upcoming: "text-muted-foreground",
    disputed: "text-amber-600 dark:text-amber-400",
  }
  const labels: Record<ObligationDisplay, string> = {
    paid: "Paid", overdue: "Overdue", upcoming: "Upcoming", disputed: "Disputed",
  }
  return (
    <span className={`text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ContractSummaryPage() {
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro]                 = useState(false)
  const [contracts, setContracts]         = useState<ContractRow[]>([])
  const [obligations, setObligations]     = useState<Record<string, PaymentObligation[]>>({})
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [dateFrom, setDateFrom]           = useState("")
  const [dateTo, setDateTo]               = useState("")
  const [folders, setFolders]             = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder]   = useState("")
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null)
  const [markPaidForm, setMarkPaidForm]   = useState<MarkPaidForm | null>(null)
  const [saving, setSaving]               = useState(false)
  const [backfilling, setBackfilling]     = useState(false)
  const [backfillDone, setBackfillDone]   = useState<number | null>(null)

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

  useEffect(() => {
    if (!session?.user?.id) return
    supabase.from("folders").select("id, name").eq("user_id", session.user.id).order("name")
      .then(({ data }) => { if (data) setFolders(data) })
  }, [session])

  const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

  const loadContracts = useCallback(async () => {
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

      if (!userFiles?.length) return

      const fileIds = userFiles.map((f: any) => f.id)

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
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setContracts(data.map((row: any) => ({
          file_id:           row.file_id,
          filename:          row.files?.filename ?? "unknown",
          document_type:     row.files?.document_type ?? "unknown",
          counterparty_name: row.counterparty_name,
          document_date:     row.document_date,
          period_start:      row.period_start,
          period_end:        row.period_end,
          invoice_number:    row.invoice_number,
          total_amount:      row.total_amount != null ? safeNum(row.total_amount) : null,
          currency:          row.currency,
          payment_method:    row.payment_method,
          confidence_score:  row.confidence_score,
        })))

        const { data: obligs } = await supabase
          .from("payment_obligations")
          .select("*")
          .in("file_id", fileIds)
          .order("due_date", { ascending: true })

        if (obligs) {
          const grouped: Record<string, PaymentObligation[]> = {}
          for (const o of obligs as PaymentObligation[]) {
            if (!grouped[o.file_id]) grouped[o.file_id] = []
            grouped[o.file_id].push(o)
          }
          setObligations(grouped)
        }
      }
    } catch (err) {
      console.error("loadContracts error:", err)
      setError("Failed to load contract data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadContracts() }, [loadContracts])

  // ── Mark paid ──────────────────────────────────────────────────────────────

  async function handleMarkPaid() {
    if (!markPaidForm) return
    setSaving(true)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch(`/api/obligations/${markPaidForm.obligationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${s?.access_token}`,
        },
        body: JSON.stringify({
          status:   "paid",
          paid_at:  markPaidForm.paid_at || new Date().toISOString().split("T")[0],
          paid_via: markPaidForm.paid_via || null,
        }),
      })
      if (res.ok) {
        setMarkPaidForm(null)
        await loadContracts()
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Backfill ───────────────────────────────────────────────────────────────

  async function handleBackfill() {
    setBackfilling(true)
    setBackfillDone(null)
    try {
      const { data: { session: s } } = await supabase.auth.getSession()
      const res = await fetch("/api/obligations/backfill", {
        method: "POST",
        headers: { "Authorization": `Bearer ${s?.access_token}` },
      })
      const json = await res.json()
      setBackfillDone(json.created ?? 0)
      if (json.created > 0) await loadContracts()
    } finally {
      setBackfilling(false)
    }
  }

  // ── Aggregations ───────────────────────────────────────────────────────────

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

  const allObligations  = Object.values(obligations).flat()
  const totalObligAmt   = allObligations.reduce((s, o) => s + (o.amount ?? 0), 0)
  const totalPaidAmt    = allObligations.filter((o) => o.status === "paid").reduce((s, o) => s + (o.amount ?? 0), 0)
  const overdueList     = allObligations.filter((o) => o.status !== "paid" && o.status !== "disputed" && o.due_date < today)
  const totalOverdueAmt = overdueList.reduce((s, o) => s + (o.amount ?? 0), 0)
  const nextDue         = allObligations
    .filter((o) => o.status === "pending" && o.due_date >= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null

  // ── Guards ─────────────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

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
                Contract Summary
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Generated {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })}
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
          ) : contracts.length === 0 ? (
            <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
              No contract or agreement documents found.
            </div>
          ) : (
            <div className="space-y-10">

              {/* Summary strip */}
              <div className="grid grid-cols-4 divide-x divide-border border border-border">
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Contracts</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{contracts.length}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Counterparties</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{uniqueCounterparties}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Active</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{activeCount}</p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Obligations</p>
                  <p className="mt-1.5 font-mono text-xl tabular-nums text-foreground">{allObligations.length}</p>
                </div>
              </div>

              {/* Payment obligations strip */}
              {allObligations.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Payment Obligations
                  </p>
                  <div className="grid grid-cols-4 divide-x divide-border border border-border">
                    <div className="px-5 py-4">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Total Scheduled</p>
                      <p className="mt-1.5 font-mono text-sm tabular-nums text-foreground">
                        {formatCurrency(totalObligAmt, currency)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{allObligations.length} payment{allObligations.length !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Paid</p>
                      <p className="mt-1.5 font-mono text-sm tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totalPaidAmt, currency)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {allObligations.filter((o) => o.status === "paid").length} cleared
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Overdue</p>
                      <p className={`mt-1.5 font-mono text-sm tabular-nums ${overdueList.length > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                        {overdueList.length > 0 ? formatCurrency(totalOverdueAmt, currency) : "—"}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {overdueList.length > 0 ? `${overdueList.length} missed` : "None overdue"}
                      </p>
                    </div>
                    <div className="px-5 py-4">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Next Due</p>
                      {nextDue ? (
                        <>
                          <p className="mt-1.5 font-mono text-sm tabular-nums text-foreground">{formatDate(nextDue.due_date)}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
                            {nextDue.counterparty_name ?? nextDue.description ?? "—"}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1.5 font-mono text-sm tabular-nums text-muted-foreground">—</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* By Counterparty */}
              <div>
                <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  By Counterparty
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        Counterparty
                      </th>
                      <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        Contracts
                      </th>
                      <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                        Total Value
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byCounterparty.map((cp) => (
                      <tr key={cp.name}>
                        <td className="py-2.5 text-foreground">{cp.name}</td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">{cp.count}</td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                          {cp.total > 0 ? formatCurrency(cp.total, currency) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Contract Detail */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    Contract Detail
                  </p>
                  <div className="flex items-center gap-3">
                    {backfillDone !== null && (
                      <span className="text-[10px] text-muted-foreground">
                        {backfillDone === 0 ? "Already up to date" : `${backfillDone} obligation${backfillDone !== 1 ? "s" : ""} imported`}
                      </span>
                    )}
                    <button
                      onClick={handleBackfill}
                      disabled={backfilling}
                      className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${backfilling ? "animate-spin" : ""}`} />
                      {backfilling ? "Importing…" : "Import Schedules"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Date</th>
                        <th className="pb-2 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Counterparty</th>
                        <th className="pb-2 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Ref No</th>
                        <th className="pb-2 pr-6 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Period</th>
                        <th className="pb-2 pr-6 text-right text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Value</th>
                        <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">Schedule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contracts.map((row, i) => {
                        const rowObligations = obligations[row.file_id] ?? []
                        const isExpanded = expandedFileId === row.file_id
                        const periodStart = row.period_start ? formatDate(row.period_start) : null
                        const periodEnd   = row.period_end   ? formatDate(row.period_end)   : null
                        const period =
                          periodStart && periodEnd ? `${periodStart} – ${periodEnd}`
                          : periodStart             ? `${periodStart} –`
                          : periodEnd               ? `– ${periodEnd}`
                          : "—"
                        return (
                          <>
                            <tr key={`r-${i}`} className="border-b border-border">
                              <td className="py-3 pr-6 font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                                {row.document_date ? formatDate(row.document_date) : "—"}
                              </td>
                              <td className="py-3 pr-6 text-foreground">{row.counterparty_name ?? "—"}</td>
                              <td className="py-3 pr-6 font-mono tabular-nums text-xs text-muted-foreground">{row.invoice_number ?? "—"}</td>
                              <td className="py-3 pr-6 text-xs text-muted-foreground whitespace-nowrap">{period}</td>
                              <td className="py-3 pr-6 text-right font-mono tabular-nums text-foreground">
                                {row.total_amount != null
                                  ? formatCurrency(row.total_amount, row.currency ?? currency)
                                  : "—"}
                              </td>
                              <td className="py-3">
                                {rowObligations.length > 0 ? (
                                  <button
                                    onClick={() => setExpandedFileId(isExpanded ? null : row.file_id)}
                                    className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
                                  >
                                    {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    {rowObligations.length} payment{rowObligations.length !== 1 ? "s" : ""}
                                  </button>
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">—</span>
                                )}
                              </td>
                            </tr>

                            {/* Payment schedule panel */}
                            {isExpanded && rowObligations.length > 0 && (
                              <tr key={`oblig-${i}`}>
                                <td colSpan={6} className="pb-4 pt-0">
                                  <div className="border-x border-b border-border bg-muted/30 px-5 py-4">
                                    <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                                      Payment Schedule — {row.counterparty_name ?? row.filename}
                                    </p>
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-border/60">
                                          <th className="pb-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Due Date</th>
                                          <th className="pb-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Description</th>
                                          <th className="pb-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Check No.</th>
                                          <th className="pb-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Bank</th>
                                          <th className="pb-2 pr-4 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Amount</th>
                                          <th className="pb-2 pr-4 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Status</th>
                                          <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/70">Action</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border/40">
                                        {rowObligations.map((o) => {
                                          const s = obligationStatus(o, today)
                                          const isFormOpen = markPaidForm?.obligationId === o.id
                                          return (
                                            <tr key={o.id} className={s === "overdue" ? "bg-red-500/5" : ""}>
                                              <td className="py-2 pr-4 font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                                                {formatDate(o.due_date)}
                                              </td>
                                              <td className="py-2 pr-4 text-foreground">{o.description ?? "—"}</td>
                                              <td className="py-2 pr-4 font-mono tabular-nums text-muted-foreground">{o.check_number ?? "—"}</td>
                                              <td className="py-2 pr-4 text-muted-foreground">{o.bank_name ?? "—"}</td>
                                              <td className="py-2 pr-4 text-right font-mono tabular-nums text-foreground">
                                                {o.amount != null ? formatCurrency(o.amount, o.currency ?? currency) : "—"}
                                              </td>
                                              <td className="py-2 pr-4">
                                                <StatusBadge status={s} />
                                                {o.paid_at && (
                                                  <p className="mt-0.5 text-[10px] text-muted-foreground/60">
                                                    {formatDate(o.paid_at)}{o.paid_via ? ` · ${o.paid_via}` : ""}
                                                  </p>
                                                )}
                                              </td>
                                              <td className="py-2">
                                                {(s === "upcoming" || s === "overdue") && (
                                                  isFormOpen ? (
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                      <input
                                                        type="date"
                                                        value={markPaidForm.paid_at}
                                                        onChange={(e) => setMarkPaidForm({ ...markPaidForm, paid_at: e.target.value })}
                                                        className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                                      />
                                                      <input
                                                        type="text"
                                                        placeholder="via (e.g. BDO Check)"
                                                        value={markPaidForm.paid_via}
                                                        onChange={(e) => setMarkPaidForm({ ...markPaidForm, paid_via: e.target.value })}
                                                        className="w-32 rounded border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
                                                      />
                                                      <button
                                                        onClick={handleMarkPaid}
                                                        disabled={saving}
                                                        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700 disabled:opacity-50"
                                                      >
                                                        {saving ? "…" : "Save"}
                                                      </button>
                                                      <button
                                                        onClick={() => setMarkPaidForm(null)}
                                                        className="text-xs text-muted-foreground hover:text-foreground"
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  ) : (
                                                    <button
                                                      onClick={() => setMarkPaidForm({
                                                        obligationId: o.id,
                                                        paid_at: today,
                                                        paid_via: "",
                                                      })}
                                                      className="rounded border border-border px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                                    >
                                                      Mark Paid
                                                    </button>
                                                  )
                                                )}
                                                {s === "paid" && (
                                                  <button
                                                    onClick={async () => {
                                                      const { data: { session: cs } } = await supabase.auth.getSession()
                                                      await fetch(`/api/obligations/${o.id}`, {
                                                        method: "PATCH",
                                                        headers: {
                                                          "Content-Type": "application/json",
                                                          "Authorization": `Bearer ${cs?.access_token}`,
                                                        },
                                                        body: JSON.stringify({ status: "pending", paid_at: null, paid_via: null }),
                                                      })
                                                      await loadContracts()
                                                    }}
                                                    className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                                                  >
                                                    Undo
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Disclaimer */}
              <p className="border-t border-border pt-6 text-[10px] leading-relaxed text-muted-foreground/60">
                This report is generated from AI-extracted document data. Contract terms, payment obligations, and amounts should be verified against original source documents. Not legal or financial advice.
              </p>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
