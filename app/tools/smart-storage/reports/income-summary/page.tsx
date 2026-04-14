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

// ── Types ──────────────────────────────────────────────────────────────────────

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "2-digit",
  })
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function IncomeSummaryPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { isActive: isPro } = useEntitlement(session)
  const [income, setIncome] = useState<IncomeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState("")

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

  const loadIncome = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    try {
      let filesQuery = supabase
        .from("files")
        .select("id")
        .eq("user_id", session.user.id)
        .in("document_type", ["payslip", "income_statement"])
      if (targetFolder) filesQuery = filesQuery.eq("folder_id", targetFolder)
      const { data: userFiles } = await filesQuery

      if (!userFiles?.length) return

      let query = supabase
        .from("document_fields")
        .select(`
          file_id, employer_name, document_date,
          gross_income, net_income, total_amount, currency, confidence_score,
          files!inner(filename, document_type)
        `)
        .in("file_id", userFiles.map(f => f.id))
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setIncome(data.map((row: any) => ({
          filename:         row.files?.filename ?? "unknown",
          document_type:    row.files?.document_type ?? "unknown",
          employer_name:    row.employer_name,
          document_date:    row.document_date,
          gross_income:     row.gross_income != null ? safeNum(row.gross_income) : null,
          net_income:       row.net_income != null ? safeNum(row.net_income) : null,
          total_amount:     row.total_amount != null ? safeNum(row.total_amount) : null,
          currency:         row.currency,
          confidence_score: row.confidence_score,
        })))
      }
    } catch (err) {
      console.error("loadIncome error:", err)
      setError("Failed to load income data. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadIncome() }, [loadIncome])

  // ── Aggregations ──────────────────────────────────────────────────────────────

  const _cc = income.reduce((acc: Record<string, number>, r) => {
    const c = r.currency ?? "USD"; acc[c] = (acc[c] ?? 0) + Math.abs(r.gross_income ?? r.total_amount ?? 0); return acc
  }, {})
  const currency = Object.entries(_cc).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

  const totalGross = income.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalNet   = income.reduce((s, r) => s + (r.net_income ?? 0), 0)
  const totalWithholding = income.reduce((s, r) => {
    if (r.gross_income != null && r.net_income != null) return s + Math.max(0, r.gross_income - r.net_income)
    return s
  }, 0)

  const uniqueMonths = new Set(income.map(r => r.document_date?.slice(0, 7)).filter(Boolean)).size
  const avgMonthly   = uniqueMonths > 0 ? totalGross / uniqueMonths : totalGross

  // Group by employer
  const byEmployer = new Map<string, { gross: number; net: number; withholding: number; docs: number }>()
  for (const r of income) {
    const key = r.employer_name ?? "Unknown Employer"
    const existing = byEmployer.get(key) ?? { gross: 0, net: 0, withholding: 0, docs: 0 }
    const gross = r.gross_income ?? r.total_amount ?? 0
    const net   = r.net_income ?? 0
    byEmployer.set(key, {
      gross:       existing.gross + gross,
      net:         existing.net  + net,
      withholding: existing.withholding + (r.gross_income != null && r.net_income != null ? Math.max(0, gross - net) : 0),
      docs:        existing.docs + 1,
    })
  }

  const allDates  = income.map(r => r.document_date).filter(Boolean) as string[]
  const periodStart = allDates.length ? allDates.reduce((a, b) => a < b ? a : b) : null
  const periodEnd   = allDates.length ? allDates.reduce((a, b) => a > b ? a : b) : null

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

          {/* Filters */}
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

            <span className="mx-1 h-4 w-px bg-border" />

            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Source</span>
            <div className="relative">
              <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select
                value={targetFolder}
                onChange={e => setTargetFolder(e.target.value)}
                className="appearance-none rounded border border-border bg-background py-1.5 pl-7 pr-6 text-xs text-foreground"
              >
                <option value="">All data</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-32 text-xs uppercase tracking-widest text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-32 text-xs text-red-500">
              {error}
            </div>
          ) : income.length === 0 ? (
            <div className="flex items-center justify-center py-32 text-xs text-muted-foreground">
              No income data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Report Header ── */}
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Income Summary</h1>
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
                  <div className="print:hidden">
                    <Button variant="outline" size="sm" className="shrink-0 gap-2 rounded text-xs" onClick={() => window.print()}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Summary Strip ── */}
              <div className="grid grid-cols-2 divide-x divide-border border border-border rounded sm:grid-cols-4">
                {[
                  { label: "Gross Income",   value: fmt(totalGross, currency) },
                  { label: "Net Income",      value: totalNet > 0 ? fmt(totalNet, currency) : "—" },
                  { label: "Tax Withheld",    value: totalWithholding > 0 ? fmt(totalWithholding, currency) : "—" },
                  { label: "Avg Monthly",     value: fmt(avgMonthly, currency) },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                    <p className="mt-1.5 font-mono text-base font-medium tabular-nums text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Income by Employer ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Income by Employer
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-medium">Employer / Source</th>
                      <th className="pb-2 text-right font-medium">Gross Income</th>
                      <th className="pb-2 text-right font-medium">Net Income</th>
                      <th className="pb-2 text-right font-medium">Tax Withheld</th>
                      <th className="pb-2 text-right font-medium">% of Total</th>
                      <th className="pb-2 text-right font-medium">Docs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {Array.from(byEmployer.entries()).map(([employer, data]) => (
                      <tr key={employer}>
                        <td className="py-2.5 text-foreground">{employer}</td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                          {fmt(data.gross, currency)}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                          {data.net > 0 ? fmt(data.net, currency) : "—"}
                        </td>
                        <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                          {data.withholding > 0 ? fmt(data.withholding, currency) : "—"}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">
                          {totalGross > 0 ? `${((data.gross / totalGross) * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-2.5 text-right text-muted-foreground">{data.docs}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="pt-2.5 text-foreground">Total</td>
                      <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                      <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                        {totalNet > 0 ? fmt(totalNet, currency) : "—"}
                      </td>
                      <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                        {totalWithholding > 0 ? fmt(totalWithholding, currency) : "—"}
                      </td>
                      <td className="pt-2.5 text-right text-muted-foreground">100%</td>
                      <td className="pt-2.5 text-right text-muted-foreground">{income.length}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Income Detail ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Income Detail
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Employer</th>
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 text-right font-medium">Gross</th>
                      <th className="pb-2 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {income.map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 text-muted-foreground">
                          {row.document_date ? formatDate(row.document_date) : "—"}
                        </td>
                        <td className="py-2 text-foreground">{row.employer_name ?? "—"}</td>
                        <td className="py-2 capitalize text-muted-foreground">{row.document_type}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-foreground">
                          {fmt(row.gross_income ?? row.total_amount ?? 0, row.currency ?? currency)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                          {row.net_income ? fmt(row.net_income, row.currency ?? currency) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td colSpan={3} className="pt-2 text-foreground">Total</td>
                      <td className="pt-2 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                      <td className="pt-2 text-right font-mono tabular-nums text-foreground">
                        {totalNet > 0 ? fmt(totalNet, currency) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Disclaimer ── */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  Figures are derived from normalized fields extracted from uploaded payslips and income statements.
                  Withholding tax is estimated from gross/net differentials. Average monthly income is calculated across
                  unique calendar months in the dataset.
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
