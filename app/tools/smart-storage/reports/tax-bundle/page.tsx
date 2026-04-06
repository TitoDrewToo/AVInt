"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import {
  ArrowLeft, Download, FolderOpen, AlertTriangle, CheckCircle2,
  XCircle, Copy, FileWarning, Ban, Printer, Archive, Save, Loader2,
} from "lucide-react"
import Link from "next/link"
import JSZip from "jszip"

// ── Schedule C Line-Item Mapping ──────────────────────────────────────────────
// Maps our generic expense categories → IRS Schedule C line numbers
// https://www.irs.gov/pub/irs-pdf/f1040sc.pdf

interface ScheduleCLine {
  line: string        // e.g. "Line 8"
  label: string       // IRS label
  categories: string[] // our categories that roll up here
}

const SCHEDULE_C_LINES: ScheduleCLine[] = [
  { line: "Line 8",  label: "Advertising",                categories: ["Marketing", "Advertising", "Design", "Printing"] },
  { line: "Line 9",  label: "Car & Truck Expenses",       categories: ["Fuel", "Parking", "Transport"] },
  { line: "Line 10", label: "Commissions & Fees",         categories: ["Bank Fees"] },
  { line: "Line 11", label: "Contract Labor",             categories: ["Consulting"] },
  { line: "Line 13", label: "Depreciation (§179)",        categories: ["Equipment", "Hardware"] },
  { line: "Line 15", label: "Insurance",                  categories: ["Insurance"] },
  { line: "Line 17", label: "Legal & Professional",       categories: ["Legal", "Accounting", "Professional Services"] },
  { line: "Line 18", label: "Office Expense",             categories: ["Office", "Office Supplies"] },
  { line: "Line 20b",label: "Rent (Other)",               categories: ["Rent", "Coworking"] },
  { line: "Line 21", label: "Repairs & Maintenance",      categories: ["Repairs", "Maintenance"] },
  { line: "Line 22", label: "Supplies",                   categories: ["Subscriptions", "SaaS", "Cloud Services", "Software"] },
  { line: "Line 23", label: "Taxes & Licenses",           categories: ["Tax", "Taxes"] },
  { line: "Line 24a",label: "Travel",                     categories: ["Travel", "Accommodation", "Airfare"] },
  { line: "Line 24b",label: "Meals (50% deductible)",     categories: ["Meals", "Entertainment", "Client Entertainment"] },
  { line: "Line 25", label: "Utilities",                  categories: ["Utilities", "Internet", "Phone"] },
  { line: "Line 27a",label: "Other Expenses",             categories: ["Training", "Education", "Conferences"] },
]

// Reverse lookup: category → schedule C line
const CATEGORY_TO_LINE = new Map<string, string>()
for (const sc of SCHEDULE_C_LINES) {
  for (const cat of sc.categories) {
    CATEGORY_TO_LINE.set(cat.toLowerCase(), sc.line)
  }
}

function getScheduleCLine(category: string | null): string | null {
  if (!category) return null
  return CATEGORY_TO_LINE.get(category.toLowerCase()) ?? null
}

function getScheduleCLabel(lineNum: string): string {
  return SCHEDULE_C_LINES.find(l => l.line === lineNum)?.label ?? "Other"
}

// ── Deductibility Confidence ──────────────────────────────────────────────────

type DeductStatus = "deductible" | "review" | "uncategorized"

function getDeductStatus(category: string | null, confidence: number | null): DeductStatus {
  if (!category || category === "Uncategorized" || category === "Other") return "uncategorized"
  const line = getScheduleCLine(category)
  if (!line) return "review"                       // category exists but doesn't map to Schedule C
  if (confidence !== null && confidence < 0.7) return "review"  // low AI confidence
  return "deductible"
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FolderOption { id: string; name: string }

interface TaxRow {
  file_id: string
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
  confidence_score: number | null
  storage_path: string | null
}

// All Schedule C categories available for reassignment
const ALL_SC_CATEGORIES = SCHEDULE_C_LINES.flatMap(l => l.categories).sort()

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    year: "numeric", month: "short", day: "2-digit",
  })
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

// ── Component ─────────────────────────────────────────────────────────────────

export default function TaxBundlePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [rows, setRows] = useState<TaxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState("")
  const [csvCopied, setCsvCopied] = useState(false)
  const [zipping, setZipping] = useState(false)
  const [reassigning, setReassigning] = useState<Record<string, string>>({}) // file_id → new category

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

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    try {
      let filesQuery = supabase
        .from("files")
        .select("id, document_type")
        .eq("user_id", session.user.id)
      if (targetFolder) filesQuery = filesQuery.eq("folder_id", targetFolder)
      const { data: userFiles } = await filesQuery

      if (!userFiles?.length) { setRows([]); return }

      let query = supabase
        .from("document_fields")
        .select(`
          file_id, vendor_name, employer_name, document_date,
          total_amount, gross_income, net_income, expense_category, currency,
          confidence_score,
          files!inner(filename, document_type, storage_path)
        `)
        .in("file_id", userFiles.map(f => f.id))
        .order("document_date", { ascending: false })

      if (dateFrom) query = query.gte("document_date", dateFrom)
      if (dateTo)   query = query.lte("document_date", dateTo)

      const { data } = await query

      if (data) {
        setRows(data.map((row: any) => ({
          file_id:          row.file_id,
          filename:         row.files?.filename ?? "unknown",
          document_type:    row.files?.document_type ?? "unknown",
          vendor_name:      row.vendor_name,
          employer_name:    row.employer_name,
          document_date:    row.document_date,
          total_amount:     row.total_amount != null ? safeNum(row.total_amount) : null,
          gross_income:     row.gross_income != null ? safeNum(row.gross_income) : null,
          net_income:       row.net_income != null ? safeNum(row.net_income) : null,
          expense_category: row.expense_category,
          currency:         row.currency,
          confidence_score: row.confidence_score != null ? safeNum(row.confidence_score) : null,
          storage_path:     row.files?.storage_path ?? null,
        })))
      }
    } catch (err) {
      console.error("loadData error:", err)
      setError("Failed to load tax data. Please try again.")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadData() }, [loadData])

  // ── Aggregations ────────────────────────────────────────────────────────────

  const _currencyCount = rows.reduce((acc: Record<string, number>, r) => {
    const c = r.currency ?? "USD"; acc[c] = (acc[c] ?? 0) + Math.abs(r.total_amount ?? r.gross_income ?? 0); return acc
  }, {})
  const currency    = Object.entries(_currencyCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"
  const incomeRows  = rows.filter(r => r.document_type === "payslip" || r.document_type === "income_statement")
  const expenseRows = rows.filter(r => r.document_type === "receipt"  || r.document_type === "invoice")

  const totalGross    = incomeRows.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const totalNet      = incomeRows.reduce((s, r) => s + (r.net_income ?? 0), 0)
  const totalExpenses = expenseRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const estimatedTaxable = totalGross - totalExpenses

  const totalWithholding = incomeRows.reduce((s, r) => {
    if (r.gross_income != null && r.net_income != null) {
      return s + Math.max(0, r.gross_income - r.net_income)
    }
    return s
  }, 0)

  // Group income by employer
  const incomeByEmployer = new Map<string, { gross: number; net: number; withholding: number; docs: number }>()
  for (const r of incomeRows) {
    const key = r.employer_name ?? "Unknown Employer"
    const existing = incomeByEmployer.get(key) ?? { gross: 0, net: 0, withholding: 0, docs: 0 }
    const gross = r.gross_income ?? r.total_amount ?? 0
    const net   = r.net_income ?? 0
    incomeByEmployer.set(key, {
      gross:       existing.gross + gross,
      net:         existing.net + net,
      withholding: existing.withholding + (r.gross_income != null && r.net_income != null ? Math.max(0, gross - net) : 0),
      docs:        existing.docs + 1,
    })
  }

  // ── Schedule C Expense Grouping ─────────────────────────────────────────────

  interface ScheduleCTotal {
    line: string
    label: string
    amount: number
    items: TaxRow[]
    reviewCount: number
  }

  const scheduleCTotals = new Map<string, ScheduleCTotal>()
  const uncategorizedItems: TaxRow[] = []
  const reviewItems: TaxRow[] = []

  for (const r of expenseRows) {
    const status = getDeductStatus(r.expense_category, r.confidence_score)
    const scLine = getScheduleCLine(r.expense_category)

    if (status === "uncategorized") {
      uncategorizedItems.push(r)
      continue
    }

    if (status === "review") {
      reviewItems.push(r)
    }

    const lineKey = scLine ?? "Line 27a" // unmapped → Other Expenses
    const existing = scheduleCTotals.get(lineKey) ?? {
      line: lineKey,
      label: getScheduleCLabel(lineKey),
      amount: 0,
      items: [],
      reviewCount: 0,
    }
    existing.amount += r.total_amount ?? 0
    existing.items.push(r)
    if (status === "review") existing.reviewCount++
    scheduleCTotals.set(lineKey, existing)
  }

  // Sort by line number
  const sortedScheduleC = Array.from(scheduleCTotals.values())
    .sort((a, b) => {
      const numA = parseFloat(a.line.replace(/[^\d.]/g, "")) || 99
      const numB = parseFloat(b.line.replace(/[^\d.]/g, "")) || 99
      return numA - numB
    })

  // ── Monthly Expense Breakdown ───────────────────────────────────────────────

  const monthlyExpenses = new Map<string, number>() // "2025-01" → amount
  const allExpenseMonths = new Set<string>()

  for (const r of expenseRows) {
    if (r.document_date) {
      const ym = r.document_date.slice(0, 7) // "YYYY-MM"
      monthlyExpenses.set(ym, (monthlyExpenses.get(ym) ?? 0) + (r.total_amount ?? 0))
      allExpenseMonths.add(ym)
    }
  }

  // Determine year range for gap detection
  const allDates = rows.map(r => r.document_date).filter(Boolean) as string[]
  const taxYear = allDates.length
    ? new Set(allDates.map(d => d.slice(0, 4))).size === 1
      ? allDates[0].slice(0, 4)
      : `${allDates.reduce((a, b) => a < b ? a : b).slice(0, 4)}–${allDates.reduce((a, b) => a > b ? a : b).slice(0, 4)}`
    : "—"

  // Build full month range for gap detection
  const sortedMonths = Array.from(allExpenseMonths).sort()
  let fullMonthRange: string[] = []
  if (sortedMonths.length >= 2) {
    const [startY, startM] = sortedMonths[0].split("-").map(Number)
    const [endY, endM] = sortedMonths[sortedMonths.length - 1].split("-").map(Number)
    let y = startY, m = startM
    while (y < endY || (y === endY && m <= endM)) {
      fullMonthRange.push(`${y}-${String(m).padStart(2, "0")}`)
      m++
      if (m > 12) { m = 1; y++ }
    }
  } else {
    fullMonthRange = sortedMonths
  }

  const missingMonths = fullMonthRange.filter(m => !monthlyExpenses.has(m))

  // ── Duplicate Detection ─────────────────────────────────────────────────────

  interface DuplicateGroup { key: string; items: TaxRow[] }

  const dupMap = new Map<string, TaxRow[]>()
  for (const r of expenseRows) {
    if (r.vendor_name && r.total_amount != null && r.document_date) {
      const key = `${r.vendor_name.toLowerCase().trim()}|${r.total_amount.toFixed(2)}|${r.document_date}`
      const arr = dupMap.get(key) ?? []
      arr.push(r)
      dupMap.set(key, arr)
    }
  }
  const duplicates: DuplicateGroup[] = []
  for (const [key, items] of dupMap) {
    if (items.length > 1) duplicates.push({ key, items })
  }

  // ── Tax Readiness Score ─────────────────────────────────────────────────────

  const readinessChecks = [
    { label: "Income documents uploaded", pass: incomeRows.length > 0 },
    { label: "Expense documents uploaded", pass: expenseRows.length > 0 },
    { label: "No uncategorized expenses",  pass: uncategorizedItems.length === 0 },
    { label: "No potential duplicates",    pass: duplicates.length === 0 },
    { label: "No month gaps in records",   pass: missingMonths.length === 0 },
    { label: "All expenses map to Schedule C", pass: reviewItems.length === 0 },
  ]
  const passCount = readinessChecks.filter(c => c.pass).length
  const readinessPercent = Math.round((passCount / readinessChecks.length) * 100)

  // ── CSV Export ──────────────────────────────────────────────────────────────

  function generateCSV(): string {
    const lines: string[] = []
    // Header
    lines.push("Schedule C Line,IRS Category,Our Category,Vendor,Date,Amount,Status,Source File")

    for (const sc of sortedScheduleC) {
      for (const item of sc.items) {
        const status = getDeductStatus(item.expense_category, item.confidence_score)
        lines.push([
          sc.line,
          `"${sc.label}"`,
          `"${item.expense_category ?? "Uncategorized"}"`,
          `"${(item.vendor_name ?? "").replace(/"/g, '""')}"`,
          item.document_date ?? "",
          (item.total_amount ?? 0).toFixed(2),
          status,
          `"${item.filename.replace(/"/g, '""')}"`,
        ].join(","))
      }
    }

    // Uncategorized at bottom
    for (const item of uncategorizedItems) {
      lines.push([
        "N/A",
        '"Uncategorized"',
        `"${item.expense_category ?? "None"}"`,
        `"${(item.vendor_name ?? "").replace(/"/g, '""')}"`,
        item.document_date ?? "",
        (item.total_amount ?? 0).toFixed(2),
        "uncategorized",
        `"${item.filename.replace(/"/g, '""')}"`,
      ].join(","))
    }

    // Summary section
    lines.push("")
    lines.push("SCHEDULE C SUMMARY")
    lines.push("Line,Category,Annual Total")
    for (const sc of sortedScheduleC) {
      lines.push(`${sc.line},"${sc.label}",${sc.amount.toFixed(2)}`)
    }
    lines.push(`,"TOTAL EXPENSES",${totalExpenses.toFixed(2)}`)
    lines.push("")
    lines.push(`,"Gross Income",${totalGross.toFixed(2)}`)
    lines.push(`,"Est. Taxable Income",${estimatedTaxable.toFixed(2)}`)

    return lines.join("\n")
  }

  function downloadCSV() {
    const csv = generateCSV()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `schedule-c-tax-bundle-${taxYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function copyCSV() {
    navigator.clipboard.writeText(generateCSV()).then(() => {
      setCsvCopied(true)
      setTimeout(() => setCsvCopied(false), 2000)
    })
  }

  // ── PDF Export (print-to-PDF) ───────────────────────────────────────────────

  function printReport() {
    window.print()
  }

  // ── Zip Source Documents ────────────────────────────────────────────────────

  async function downloadZip() {
    if (zipping) return
    setZipping(true)
    try {
      const zip = new JSZip()
      const seen = new Set<string>()

      // Collect unique file_ids with storage paths
      const filesToBundle = rows.filter(r => r.storage_path && !seen.has(r.file_id) && seen.add(r.file_id))

      // Download each file from Supabase storage and add to zip
      const results = await Promise.allSettled(
        filesToBundle.map(async (r) => {
          const { data } = await supabase.storage.from("documents").createSignedUrl(r.storage_path!, 120)
          if (!data?.signedUrl) throw new Error(`No URL for ${r.filename}`)
          const res = await fetch(data.signedUrl)
          if (!res.ok) throw new Error(`Failed to fetch ${r.filename}`)
          const blob = await res.blob()

          // Organize into folders by type
          const folder = r.document_type === "payslip" || r.document_type === "income_statement"
            ? "income" : "expenses"
          zip.file(`${folder}/${r.filename}`, blob)
        })
      )

      const failed = results.filter(r => r.status === "rejected").length
      if (failed > 0 && failed === filesToBundle.length) {
        setError(`Failed to download all ${failed} files. Please try again.`)
        return
      }

      // Add the CSV summary to the zip
      zip.file(`schedule-c-summary-${taxYear}.csv`, generateCSV())

      // Generate and download
      const content = await zip.generateAsync({ type: "blob" })
      const url = URL.createObjectURL(content)
      const a = document.createElement("a")
      a.href = url
      a.download = `tax-bundle-${taxYear}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error("Zip error:", err)
      setError("Failed to create document bundle. Please try again.")
    } finally {
      setZipping(false)
    }
  }

  // ── Category Reassignment ───────────────────────────────────────────────────

  async function saveCategory(fileId: string, newCategory: string) {
    try {
      const { error: updateError } = await supabase
        .from("document_fields")
        .update({ expense_category: newCategory })
        .eq("file_id", fileId)

      if (updateError) throw updateError

      // Update local state
      setRows(prev => prev.map(r =>
        r.file_id === fileId ? { ...r, expense_category: newCategory } : r
      ))
      // Remove from reassigning map
      setReassigning(prev => {
        const next = { ...prev }
        delete next[fileId]
        return next
      })
    } catch (err) {
      console.error("Category update error:", err)
      setError("Failed to update category. Please try again.")
    }
  }

  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })
  const hasData = incomeRows.length > 0 || expenseRows.length > 0

  // ── Render ──────────────────────────────────────────────────────────────────

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
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-32 text-xs text-red-500">
              {error}
            </div>
          ) : !hasData ? (
            <div className="flex items-center justify-center py-32 text-xs text-muted-foreground">
              No data found for the selected period.
            </div>
          ) : (
            <div className="space-y-10">

              {/* ── Report Header ── */}
              <div className="border-b border-border pb-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">AVINTELLIGENCE</p>
                    <h1 className="text-2xl font-light tracking-tight text-foreground">Tax Bundle — Schedule C</h1>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Tax Period: {taxYear}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span>Generated {generatedDate}</span>
                    </div>
                    <p className="mt-2 text-[10px] text-muted-foreground/60">
                      Expense categories mapped to IRS Schedule C (Form 1040) line items.
                      For reference only — consult a licensed tax professional before filing.
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 print:hidden">
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={copyCSV}>
                      <Copy className="h-3.5 w-3.5" />
                      {csvCopied ? "Copied!" : "Copy CSV"}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={downloadCSV}>
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={printReport}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={downloadZip} disabled={zipping}>
                      {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                      {zipping ? "Bundling..." : "Download Zip"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* ── Tax Readiness Check ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Tax Readiness
                </p>
                <div className="rounded border border-border p-5">
                  <div className="mb-4 flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                      readinessPercent === 100 ? "bg-green-500/10 text-green-500" :
                      readinessPercent >= 50 ? "bg-yellow-500/10 text-yellow-500" :
                      "bg-red-500/10 text-red-500"
                    }`}>
                      {readinessPercent}%
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {readinessPercent === 100 ? "Ready to file" :
                         readinessPercent >= 50 ? "Almost ready — review items below" :
                         "Needs attention before filing"}
                      </p>
                      <p className="text-xs text-muted-foreground">{passCount} of {readinessChecks.length} checks passed</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {readinessChecks.map(check => (
                      <div key={check.label} className="flex items-center gap-2 text-xs">
                        {check.pass
                          ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                          : <XCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                        }
                        <span className={check.pass ? "text-muted-foreground" : "text-foreground"}>{check.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Summary Strip ── */}
              <div className="grid grid-cols-1 divide-y divide-border border border-border rounded sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  { label: "Gross Income",              value: fmt(totalGross, currency), loss: false },
                  { label: "Total Documented Expenses", value: fmt(totalExpenses, currency), loss: false },
                  {
                    label: "Est. Taxable Income",
                    value: estimatedTaxable >= 0
                      ? fmt(estimatedTaxable, currency)
                      : `(${fmt(Math.abs(estimatedTaxable), currency)})`,
                    loss: estimatedTaxable < 0,
                  },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</p>
                    <p className={`mt-1.5 font-mono text-base font-medium tabular-nums ${item.loss ? "text-destructive" : "text-foreground"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Alerts: Duplicates + Missing Months ── */}
              {(duplicates.length > 0 || missingMonths.length > 0 || uncategorizedItems.length > 0) && (
                <div className="space-y-3">
                  {duplicates.length > 0 && (
                    <div className="flex items-start gap-3 rounded border border-yellow-500/20 bg-yellow-500/5 p-4">
                      <Ban className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {duplicates.length} potential duplicate{duplicates.length > 1 ? "s" : ""} detected
                        </p>
                        <div className="mt-1.5 space-y-1">
                          {duplicates.map(d => (
                            <p key={d.key} className="text-xs text-muted-foreground">
                              {d.items[0].vendor_name} — {fmt(d.items[0].total_amount ?? 0, currency)} on {d.items[0].document_date}
                              <span className="ml-1 text-yellow-500">({d.items.length} entries)</span>
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {missingMonths.length > 0 && (
                    <div className="flex items-start gap-3 rounded border border-yellow-500/20 bg-yellow-500/5 p-4">
                      <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Missing expense records for {missingMonths.length} month{missingMonths.length > 1 ? "s" : ""}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {missingMonths.map(m => {
                            const [y, mo] = m.split("-")
                            return `${MONTH_NAMES[parseInt(mo) - 1]} ${y}`
                          }).join(", ")}
                        </p>
                      </div>
                    </div>
                  )}

                  {uncategorizedItems.length > 0 && (
                    <div className="rounded border border-red-500/20 bg-red-500/5 p-4 print:hidden">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {uncategorizedItems.length} uncategorized expense{uncategorizedItems.length > 1 ? "s" : ""} — assign a category to map to Schedule C
                          </p>
                          <div className="mt-3 space-y-2">
                            {uncategorizedItems.map((item) => (
                              <div key={item.file_id} className="flex flex-wrap items-center gap-2 rounded border border-border/50 bg-background/50 p-2">
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={item.filename}>
                                  {item.vendor_name ?? item.filename}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  {fmt(item.total_amount ?? 0, currency)}
                                </span>
                                <select
                                  className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                  value={reassigning[item.file_id] ?? ""}
                                  onChange={e => setReassigning(prev => ({ ...prev, [item.file_id]: e.target.value }))}
                                >
                                  <option value="">Select category...</option>
                                  {ALL_SC_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat} ({getScheduleCLine(cat)})</option>
                                  ))}
                                </select>
                                {reassigning[item.file_id] && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 rounded px-2 text-[10px]"
                                    onClick={() => saveCategory(item.file_id, reassigning[item.file_id])}
                                  >
                                    <Save className="h-3 w-3" /> Save
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Income Summary ── */}
              {incomeRows.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Income Summary
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Employer / Source</th>
                        <th className="pb-2 text-right font-medium">Gross Income</th>
                        <th className="pb-2 text-right font-medium">Net Income</th>
                        <th className="pb-2 text-right font-medium">Tax Withheld</th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Array.from(incomeByEmployer.entries()).map(([employer, data]) => (
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
                        <td className="pt-2.5 text-right text-muted-foreground">{incomeRows.length}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Schedule C Expense Breakdown ── */}
              {sortedScheduleC.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Schedule C — Expense Breakdown
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Line</th>
                        <th className="pb-2 font-medium">IRS Category</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 text-right font-medium">Items</th>
                        <th className="pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {sortedScheduleC.map(sc => (
                        <tr key={sc.line}>
                          <td className="py-2.5 font-mono text-xs text-muted-foreground">{sc.line}</td>
                          <td className="py-2.5 text-foreground">
                            {sc.label}
                            {sc.line === "Line 24b" && (
                              <span className="ml-1.5 text-[10px] text-yellow-500">50%</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                            ({fmt(sc.amount, currency)})
                          </td>
                          <td className="py-2.5 text-right text-muted-foreground">{sc.items.length}</td>
                          <td className="py-2.5 text-right">
                            {sc.reviewCount > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-500">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {sc.reviewCount} review
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5" />
                        <td className="pt-2.5 text-foreground">Total Expenses</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          ({fmt(totalExpenses, currency)})
                        </td>
                        <td className="pt-2.5 text-right text-muted-foreground">{expenseRows.length}</td>
                        <td className="pt-2.5" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Monthly Expense Summary ── */}
              {fullMonthRange.length > 0 && (
                <div>
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Monthly Expense Summary
                  </p>
                  <div className="rounded border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-4 pb-2 pt-3 font-medium">Month</th>
                          <th className="px-4 pb-2 pt-3 text-right font-medium">Amount</th>
                          <th className="px-4 pb-2 pt-3 font-medium">Bar</th>
                          <th className="px-4 pb-2 pt-3 text-right font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {fullMonthRange.map(ym => {
                          const amount = monthlyExpenses.get(ym) ?? 0
                          const maxMonth = Math.max(...Array.from(monthlyExpenses.values()), 1)
                          const barPct = (amount / maxMonth) * 100
                          const isMissing = amount === 0
                          const [y, mo] = ym.split("-")
                          return (
                            <tr key={ym} className={isMissing ? "bg-yellow-500/5" : ""}>
                              <td className="px-4 py-2 text-foreground">{MONTH_NAMES[parseInt(mo) - 1]} {y}</td>
                              <td className="px-4 py-2 text-right font-mono tabular-nums text-foreground">
                                {amount > 0 ? fmt(amount, currency) : "—"}
                              </td>
                              <td className="px-4 py-2">
                                <div className="h-2 w-full rounded-full bg-border/30">
                                  <div className="h-2 rounded-full bg-foreground/20" style={{ width: `${barPct}%` }} />
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right">
                                {isMissing ? (
                                  <span className="text-[10px] text-yellow-500">No records</span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">{
                                    expenseRows.filter(r => r.document_date?.startsWith(ym)).length
                                  } docs</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-border font-semibold">
                          <td className="px-4 pt-2.5 pb-3 text-foreground">Annual Total</td>
                          <td className="px-4 pt-2.5 pb-3 text-right font-mono tabular-nums text-foreground">
                            {fmt(totalExpenses, currency)}
                          </td>
                          <td className="px-4 pt-2.5 pb-3" />
                          <td className="px-4 pt-2.5 pb-3 text-right text-xs text-muted-foreground">
                            {expenseRows.length} total
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tax Computation Box ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Tax Computation
                </p>
                <div className="rounded border border-border p-6">
                  <table className="w-full text-sm">
                    <colgroup>
                      <col />
                      <col style={{ width: "13rem" }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Gross Income</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Less: Schedule C Expenses</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">({fmt(totalExpenses, currency)})</td>
                      </tr>
                      <tr className="border-t border-border">
                        <td className="py-2 font-semibold text-foreground">Est. Taxable Income (Line 31)</td>
                        <td className={`py-2 text-right font-mono tabular-nums font-semibold ${estimatedTaxable < 0 ? "text-destructive" : "text-foreground"}`}>
                          {estimatedTaxable >= 0
                            ? fmt(estimatedTaxable, currency)
                            : `(${fmt(Math.abs(estimatedTaxable), currency)})`}
                        </td>
                      </tr>
                      {totalWithholding > 0 && (
                        <>
                          <tr><td colSpan={2} className="py-2" /></tr>
                          <tr>
                            <td className="py-1.5 text-foreground/80">Withholding Tax Credited</td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                              ({fmt(totalWithholding, currency)})
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-4 text-[10px] text-muted-foreground/60">
                    Actual tax due depends on applicable deductions, exemptions, and tax brackets.
                    Meals (Line 24b) are typically 50% deductible. This computation is an estimate for reference only.
                  </p>
                </div>
              </div>

              {/* ── Supporting Documents ── */}
              {rows.length > 0 && (
                <div className="border-t border-border pt-6">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Audit Trail — Supporting Documents ({rows.length})
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Source File</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 font-medium">Vendor/Employer</th>
                        <th className="pb-2 text-right font-medium">Amount</th>
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium">Sched C</th>
                        <th className="pb-2 text-right font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {[...incomeRows, ...expenseRows].map((r, i) => {
                        const isExpense = r.document_type === "receipt" || r.document_type === "invoice"
                        const scLine = isExpense ? getScheduleCLine(r.expense_category) : null
                        const status = isExpense ? getDeductStatus(r.expense_category, r.confidence_score) : null
                        return (
                          <tr key={i} className={status === "review" ? "bg-yellow-500/5" : status === "uncategorized" ? "bg-red-500/5" : ""}>
                            <td className="py-2 max-w-[140px] truncate text-muted-foreground" title={r.filename}>{r.filename}</td>
                            <td className="py-2 text-muted-foreground">{r.document_type}</td>
                            <td className="py-2 text-foreground">{r.vendor_name ?? r.employer_name ?? "—"}</td>
                            <td className="py-2 text-right font-mono tabular-nums text-foreground">
                              {fmt(r.total_amount ?? r.gross_income ?? 0, currency)}
                            </td>
                            <td className="py-2 text-muted-foreground">{r.expense_category ?? "—"}</td>
                            <td className="py-2">
                              {scLine ? (
                                <span className="text-[10px] font-mono text-muted-foreground">{scLine}</span>
                              ) : isExpense ? (
                                <span className="text-[10px] text-red-500">unmapped</span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="py-2 text-right text-muted-foreground">
                              {r.document_date ? formatDate(r.document_date) : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Disclaimer ── */}
              <div className="border-t border-border pt-4">
                <p className="text-[10px] leading-relaxed text-muted-foreground/60">
                  This report maps expense categories to IRS Schedule C (Form 1040) line items for self-employment income.
                  It is not tax advice and does not constitute an official filing document.
                  Estimated taxable income is calculated as gross income minus total documented expenses.
                  Meals and entertainment expenses are typically only 50% deductible — adjust accordingly when entering into tax software.
                  Withholding tax figures are derived from payslip gross/net differentials.
                  Items flagged &ldquo;Needs Review&rdquo; may contain personal expenses or have low AI confidence.
                  Always consult a licensed tax professional before filing. Compatible with FreeTaxUSA, TurboTax, and other Schedule C filing platforms.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
