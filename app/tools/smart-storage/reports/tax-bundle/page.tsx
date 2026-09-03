"use client"

import { Suspense, useState, useEffect, useCallback, useMemo } from "react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Tip } from "@/components/ui/tip"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
import {
  ArrowLeft, Download, FolderOpen, AlertTriangle, CheckCircle2,
  XCircle, Copy, FileWarning, Ban, Printer, Archive, Save, Loader2, Info,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import JSZip from "jszip"

import { printReportOutput } from "@/lib/report-print"
import { ReportExportControls } from "@/components/report-export-controls"
import { trackActivationEvent } from "@/lib/analytics"
import {
  getScheduleCLine,
  getScheduleCLineDescription,
  getDeductStatus,
  getReviewReason,
  getSubstantiationNotes,
  getTaxRowAmount,
  computeTaxBundle,
  generateTaxBundleCSV,
  ALL_SC_CATEGORIES,
  type TaxRow,
} from "@/lib/tax-bundle"

interface FolderOption { id: string; name: string }

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

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <Tip text={text}>
      <button type="button" aria-label={`More information about ${label}`} className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary">
        <Info className="h-3 w-3" />
      </button>
    </Tip>
  )
}

function readinessDescription(label: string): string {
  if (label === "Income documents uploaded") return "At least one income document is present. Add the missing statement or payslip if this is not expected."
  if (label === "Expense documents uploaded") return "At least one expense document is present. Add receipts or invoices before handing the packet to a preparer."
  if (label === "Single currency across records") return "All rows are in one recognized currency, so the report does not need an FX decision. Convert or separately review excluded currencies."
  if (label === "No uncategorized expenses") return "Every expense has a category that maps to a Schedule C line. Assign a category to any uncategorized row to clear this check."
  if (label === "No items pending review") return "No expense is below the confidence threshold or otherwise unmapped. Review flagged rows and save a category when appropriate."
  if (label === "No potential duplicates") return "No same-vendor, same-date, same-amount cluster was detected. Confirm or remove duplicate source documents if this fails."
  if (label === "No month gaps in records") return "Every month between the first and last expense has at least one record. Confirm missing months are intentional."
  if (label === "Meals (Line 24b) adjusted to 50%") return "The report applied its 50% proposed-deductible convention to meal rows. Confirm business purpose and attendees."
  if (label === "Schedule C has a business-income base") return "A Schedule C-style net requires business income. Add or classify the relevant income statement before relying on this figure."
  if (label.includes("missing AI classification")) return "This legacy income row is using a document-type fallback. Re-normalize it so the income source is explicit."
  return "This check describes the report's readiness state. Resolve the highlighted rows or confirm the exception with the preparer."
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

function prettyIncomeClass(cls: string | null): string {
  switch (cls) {
    case "wage":       return "Wage (payslip)"
    case "business":   return "Business (Sched C)"
    case "investment": return "Investment"
    case "rental":     return "Rental"
    case "interest":   return "Interest"
    case "other":      return "Other"
    default:           return "Unclassified"
  }
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

function safeZipName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "document"
}

function zipFolderFor(row: TaxRow): string {
  return row.document_type === "payslip" || row.document_type === "income_statement"
    ? "income"
    : "expenses"
}

function zipPathFor(row: TaxRow): string {
  return `${zipFolderFor(row)}/${row.file_id}--${safeZipName(row.filename)}`
}

function generateBundleManifestCSV(rows: TaxRow[], zipPaths: Record<string, string>, failedFileIds: Set<string>): string {
  const lines = [
    "File ID,Original Filename,Zip Path,Bundle Status,Document Type,Date,Period Start,Period End,Vendor,Employer,Amount,Currency,Category,Schedule C Line,Status,Confidence,Income Source,Classification Rationale,Review Reason,Substantiation Notes",
  ]

  for (const row of rows) {
    const isExpense = row.document_type === "receipt" || row.document_type === "invoice"
    const status = isExpense ? getDeductStatus(row.expense_category, row.confidence_score) : ""
    const zipPath = zipPaths[row.file_id] ?? ""
    const bundleStatus = failedFileIds.has(row.file_id)
      ? "download_failed"
      : zipPath
        ? "bundled"
        : "no_source_file"
    lines.push([
      row.file_id,
      csvEscape(row.filename),
      csvEscape(zipPath),
      bundleStatus,
      csvEscape(row.document_type),
      row.document_date ?? "",
      row.period_start ?? "",
      row.period_end ?? "",
      csvEscape(row.vendor_name ?? ""),
      csvEscape(row.employer_name ?? ""),
      getTaxRowAmount(row).toFixed(2),
      (row.currency ?? "USD").toUpperCase(),
      csvEscape(row.expense_category ?? ""),
      isExpense ? (getScheduleCLine(row.expense_category) ?? "N/A") : "",
      status,
      row.confidence_score != null ? row.confidence_score.toFixed(2) : "",
      row.income_source ?? "",
      csvEscape(row.classification_rationale ?? ""),
      isExpense ? csvEscape(getReviewReason(row)) : "",
      isExpense ? csvEscape(getSubstantiationNotes(row)) : "",
    ].join(","))
  }

  return lines.join("\n")
}

// ── Component ─────────────────────────────────────────────────────────────────

function TaxBundleContent() {
  const searchParams = useSearchParams()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const { tier } = useEntitlement(session)
  const [rows, setRows] = useState<TaxRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "")
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "")
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [targetFolder, setTargetFolder] = useState(searchParams.get("targetFolder") ?? "")
  // Auto-scoping: on first load with data, default period to the most recent
  // tax year that has documents. Tracked so clearing dates doesn't re-apply.
  const [defaultsApplied, setDefaultsApplied] = useState(false)
  // Distinguishes "user has no docs at all" from "user has docs but none in
  // selected window" — each empty state needs a different CTA.
  const [totalOwnedDocs, setTotalOwnedDocs] = useState<number | null>(null)
  // Detected years with any document coverage, newest first. Drives the
  // tax-year preset buttons so they reflect the user's actual data.
  const [detectedYears, setDetectedYears] = useState<number[]>([])
  const [csvCopied, setCsvCopied] = useState(false)
  const [quickBooksLayout, setQuickBooksLayout] = useState<"3col" | "4col">("3col")
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
    supabase.from("folders").select("id, name").eq("user_id", session.user.id).order("name")
      .then(({ data }) => { if (data) setFolders(data) })
  }, [session])

  const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setError(null)
    setRows([])
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")

      const params = new URLSearchParams()
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (targetFolder) params.set("targetFolder", targetFolder)

      const res = await fetch(`/api/reports/tax-bundle?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed to load tax data.")

      const rows = Array.isArray(json.rows) ? json.rows : []
      setRows(rows.map((row: any) => ({
        file_id:                  row.file_id,
        filename:                 row.files?.filename ?? "unknown",
        document_type:            row.files?.document_type ?? "unknown",
        vendor_name:              row.vendor_name,
        vendor_normalized:        row.vendor_normalized,
        employer_name:            row.employer_name,
        document_date:            row.document_date,
        period_start:             row.period_start,
        period_end:               row.period_end,
        total_amount:             row.total_amount != null ? safeNum(row.total_amount) : null,
        gross_income:             row.gross_income != null ? safeNum(row.gross_income) : null,
        net_income:               row.net_income != null ? safeNum(row.net_income) : null,
        expense_category:         row.expense_category,
        income_source:            row.income_source,
        classification_rationale: row.classification_rationale,
        jurisdiction:             row.jurisdiction,
        currency:                 row.currency,
        confidence_score:         row.confidence_score != null ? safeNum(row.confidence_score) : null,
        storage_path:             row.files?.storage_path ?? null,
      })))
      setTotalOwnedDocs(typeof json.totalOwnedDocs === "number" ? json.totalOwnedDocs : 0)

      const years = Array.isArray(json.detectedYears)
        ? json.detectedYears.filter((n: unknown) => typeof n === "number" && !isNaN(n))
        : []
      setDetectedYears(years)

      if (!defaultsApplied && years.length > 0 && !dateFrom && !dateTo) {
        const y = typeof json.defaultYear === "number" && !isNaN(json.defaultYear)
          ? json.defaultYear
          : years[0]
        setDateFrom(`${y}-01-01`)
        setDateTo(`${y}-12-31`)
      }
      setDefaultsApplied(true)
    } catch (err) {
      console.error("loadData error:", err)
      setError("Failed to load tax data. Please try again.")
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, dateFrom, dateTo, targetFolder])

  useEffect(() => { loadData() }, [loadData])

  // ── Aggregations (pure) ─────────────────────────────────────────────────────

  const summary = useMemo(() => computeTaxBundle(rows), [rows])
  const {
    primaryCurrency: currency,
    currencies,
    mixedCurrency,
    incomeRows,
    expenseRows,
    wageGross,
    wageNet,
    wagePayrollDeductions,
    selfEmploymentGross,
    otherIncomeRows,
    otherIncomeGross,
    otherIncomeByType,
    totalGross,
    totalExpensesRaw,
    deductibleExpenses,
    cleanDeductibleExpenses,
    reviewDeductibleExpenses,
    estimatedNetScheduleC,
    mealsGross,
    mealsDeductible,
    scheduleC: sortedScheduleC,
    uncategorizedItems,
    reviewItems,
    incomeByEmployer,
    excludedNonUsdRows,
    excludedNonUsdByCurrency,
    excludedNonUsdRaw,
  } = summary
  const hasWageIncome = wageGross > 0
  const hasSelfEmploymentIncome = selfEmploymentGross > 0
  const hasOtherIncome = otherIncomeGross > 0

  // Legacy fallback detection: any non-expense row that still has no
  // AI-assigned income_source is running on the document_type heuristic.
  // When every income row is explicitly classified we can drop the
  // self-employment advisory banner and the forced-fail readiness check.
  const legacyUnclassifiedIncomeCount = incomeRows.filter(r => !r.income_source).length
  const hasUnclassifiedIncome = legacyUnclassifiedIncomeCount > 0

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
    const vendor = r.vendor_normalized ?? r.vendor_name
    if (vendor && r.total_amount != null && r.document_date) {
      const key = `${vendor.toLowerCase().trim()}|${r.total_amount.toFixed(2)}|${r.document_date}`
      const arr = dupMap.get(key) ?? []
      arr.push(r)
      dupMap.set(key, arr)
    }
  }
  const duplicates: DuplicateGroup[] = []
  for (const [key, items] of dupMap) {
    if (items.length > 1) duplicates.push({ key, items })
  }

  // ── Accountant Review Packet Readiness Score ───────────────────────────────

  // Only include checks that are applicable to the current dataset so the
  // denominator cannot be inflated by checks that do not apply. Meals 50%
  // is always applied in math (guaranteed by computeTaxBundle), so the check
  // is informational: it reads "Applied" when meals are present, and is
  // omitted entirely when there are no meals rows.
  const hasMeals = mealsGross > 0
  const readinessChecks: { label: string; pass: boolean }[] = [
    { label: "Income documents uploaded", pass: incomeRows.length > 0 },
    { label: "Expense documents uploaded", pass: expenseRows.length > 0 },
    { label: "Single currency across records", pass: !mixedCurrency },
    { label: "No uncategorized expenses",  pass: uncategorizedItems.length === 0 },
    { label: "No items pending review",    pass: reviewItems.length === 0 },
    { label: "No potential duplicates",    pass: duplicates.length === 0 },
    { label: "No month gaps in records",   pass: missingMonths.length === 0 },
  ]
  if (hasMeals) {
    readinessChecks.push({ label: "Meals (Line 24b) adjusted to 50%", pass: true })
  }
  // Only flag the classification check as failing if there are legacy rows
  // without an AI-assigned income_source. v2-normalized rows carry explicit
  // classification, so the assumption advisory is unnecessary.
  if (hasUnclassifiedIncome) {
    readinessChecks.push({
      label: `${legacyUnclassifiedIncomeCount} income document${legacyUnclassifiedIncomeCount === 1 ? "" : "s"} missing AI classification — re-normalize`,
      pass: false,
    })
  }
  // Wage-only negative result is a blocking condition.
  if (selfEmploymentGross === 0 && deductibleExpenses > 0) {
    readinessChecks.push({
      label: "Schedule C has a business-income base",
      pass: false,
    })
  }
  const passCount = readinessChecks.filter(c => c.pass).length
  const readinessPercent = Math.round((passCount / readinessChecks.length) * 100)

  // ── CSV Export ──────────────────────────────────────────────────────────────
  // Pure formatter lives in lib/tax-bundle.ts so it can be unit-tested.
  const generateCSV = (zipPaths?: Record<string, string>) => generateTaxBundleCSV(summary, { zipPaths })

  function downloadCSV() {
    trackActivationEvent("report_exported", { format: "csv", report: "tax_bundle" })
    const csv = generateCSV()
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `schedule-c-tax-bundle-${taxYear}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function downloadAccountingCSV(format: "quickbooks" | "xero") {
    trackActivationEvent("report_exported", { format, report: "tax_bundle" })
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) throw new Error("Unauthorized")
      const params = new URLSearchParams({ export: format })
      if (format === "quickbooks") params.set("qbColumns", quickBooksLayout === "4col" ? "4" : "3")
      if (dateFrom) params.set("dateFrom", dateFrom)
      if (dateTo) params.set("dateTo", dateTo)
      if (targetFolder) params.set("targetFolder", targetFolder)
      const res = await fetch(`/api/reports/tax-bundle?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? "Export unavailable for this plan")
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `tax-bundle-${format}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export unavailable for this plan")
    }
  }

  function copyCSV() {
    navigator.clipboard.writeText(generateCSV()).then(() => {
      setCsvCopied(true)
      setTimeout(() => setCsvCopied(false), 2000)
    })
  }

  // ── PDF Export (print-to-PDF) ───────────────────────────────────────────────

  function printReport() {
    printReportOutput()
  }

  // ── Zip Source Documents ────────────────────────────────────────────────────

  async function downloadZip() {
    if (zipping) return
    trackActivationEvent("report_exported", { format: "zip", report: "tax_bundle" })
    setZipping(true)
    try {
      const zip = new JSZip()
      const seen = new Set<string>()

      // Collect unique file_ids with storage paths
      const filesToBundle = rows.filter(r => r.storage_path && !seen.has(r.file_id) && seen.add(r.file_id))
      const zipPaths: Record<string, string> = Object.fromEntries(filesToBundle.map(r => [r.file_id, zipPathFor(r)]))

      // Download each file from Supabase storage and add to zip
      const results = await Promise.all(
        filesToBundle.map(async (r) => {
          try {
            const { data } = await supabase.storage.from("documents").createSignedUrl(r.storage_path!, 120)
            if (!data?.signedUrl) throw new Error(`No URL for ${r.filename}`)
            const res = await fetch(data.signedUrl)
            if (!res.ok) throw new Error(`Failed to fetch ${r.filename}`)
            const blob = await res.blob()

            zip.file(zipPaths[r.file_id], blob)
            return { fileId: r.file_id, ok: true, error: "" }
          } catch (err) {
            return {
              fileId: r.file_id,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }
          }
        })
      )

      const failures = results.filter(r => !r.ok)
      const failed = failures.length
      if (failed > 0 && failed === filesToBundle.length) {
        setError(`Failed to download all ${failed} files. Please try again.`)
        return
      }
      const failedFileIds = new Set(failures.map(r => r.fileId))

      // Add the CSV summary to the zip
      zip.file(`schedule-c-summary-${taxYear}.csv`, generateCSV(zipPaths))
      zip.file("manifest.csv", generateBundleManifestCSV(rows, zipPaths, failedFileIds))

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

  async function saveCategory(recordId: string | undefined, newCategory: string) {
    try {
      if (!recordId) throw new Error("This report row has no record identity. Refresh the report and try again.")
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error("Your session has expired. Sign in again before saving a category.")
      const response = await fetch(`/api/records/${recordId}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_kind: "column", target: "category", new_value: newCategory, change_kind: "reclassify" }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? "The category correction could not be saved.")
      }

      // Update local state
      setRows(prev => prev.map(r =>
        r.record_id === recordId ? { ...r, expense_category: newCategory } : r
      ))
      // Remove from reassigning map
      setReassigning(prev => {
        const next = { ...prev }
        delete next[recordId]
        return next
      })
    } catch (err) {
      console.error("Category update error:", err)
      setError("Failed to update category. Please try again.")
    }
  }

  const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" })
  const hasData = incomeRows.length > 0 || expenseRows.length > 0
  const matchedDocCount = rows.length
  const hasAnyFilter = Boolean(dateFrom || dateTo || targetFolder)
  const ownsNoDocs = totalOwnedDocs === 0
  const folderExcludingEverything = hasAnyFilter && !hasData && !!targetFolder

  // ── Period preset helpers ────────────────────────────────────────────────────
  // Dates are ISO YYYY-MM-DD strings (what <input type="date"> expects and
  // what PostgREST .gte/.lte compares against as text).

  const toISO = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }
  const applyTaxYear = (year: number) => {
    setDateFrom(`${year}-01-01`)
    setDateTo(`${year}-12-31`)
  }
  const applyLastQuarter = () => {
    const now = new Date()
    // Last completed calendar quarter.
    const currentQ = Math.floor(now.getMonth() / 3)
    const lastQ = currentQ === 0 ? 3 : currentQ - 1
    const year = currentQ === 0 ? now.getFullYear() - 1 : now.getFullYear()
    const startMonth = lastQ * 3
    const start = new Date(year, startMonth, 1)
    const end = new Date(year, startMonth + 3, 0)
    setDateFrom(toISO(start))
    setDateTo(toISO(end))
  }
  const applyLast30 = () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - 29)
    setDateFrom(toISO(start))
    setDateTo(toISO(now))
  }
  const clearPeriod = () => { setDateFrom(""); setDateTo("") }

  // Which preset (if any) is currently active — used for visual highlight.
  const activePreset: string | null = (() => {
    if (!dateFrom && !dateTo) return "all"
    for (const y of detectedYears) {
      if (dateFrom === `${y}-01-01` && dateTo === `${y}-12-31`) return `ty-${y}`
    }
    return null
  })()

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto max-w-4xl">

          {/* Back nav */}
          <div className="mb-8 flex items-center gap-3">
            <Tip text="Return to Smart Storage."><Link href="/tools/smart-storage">
              <button className="flex h-8 w-8 items-center justify-center rounded border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            </Link></Tip>
            <span className="text-xs text-muted-foreground">Smart Storage / Reports</span>
          </div>

          {/* Filters — date is the primary auto-filter, folder is optional */}
          <div className="mb-8 space-y-3 print:hidden">
            {/* Primary: period */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Period</span>
              {detectedYears.slice(0, 3).map(y => {
                const active = activePreset === `ty-${y}`
                return (
                  <Tip text="Jump to a tax year detected in your documents."><button key={y} onClick={() => applyTaxYear(y)}
                    className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}>
                    Tax Year {y}
                  </button></Tip>
                )
              })}
              <button onClick={applyLastQuarter}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Last Quarter
              </button>
              <button onClick={applyLast30}
                className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                Last 30 Days
              </button>
              <button onClick={clearPeriod}
                className={`rounded border px-3 py-1.5 text-xs transition-colors ${
                  activePreset === "all"
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}>
                All Time
              </button>
              <span className="mx-1 h-4 w-px bg-border" />
              <Tip text="Set an exact reporting period."><input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
              </Tip>
              <span className="text-xs text-muted-foreground">—</span>
              <Tip text="Set an exact reporting period."><input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground" />
              </Tip>
            </div>

            {/* Match counter + active window */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                Showing <span className="font-semibold text-foreground">{matchedDocCount}</span>
                {" "}document{matchedDocCount === 1 ? "" : "s"}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span>
                Period{" "}
                <span className="font-mono text-foreground/80">
                  {dateFrom || "—"} → {dateTo || "—"}
                </span>
              </span>
              {targetFolder && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px]">
                    <FolderOpen className="h-3 w-3" />
                    {folders.find(f => f.id === targetFolder)?.name ?? "folder"}
                    <Tip text="Clear the filter — include all documents."><button
                      onClick={() => setTargetFolder("")}
                      className="ml-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Clear folder filter"
                    >
                      ×
                    </button></Tip>
                  </span>
                </>
              )}
            </div>

            {/* Secondary: folder failsafe */}
            {folders.length > 0 && !targetFolder && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="italic">Optional — narrow to a folder if the auto-filter is picking up unrelated data:</span>
                <div className="relative">
                  <FolderOpen className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                  <Tip text="Limit this report to one folder and its subfolders."><select
                    value={targetFolder}
                    onChange={e => setTargetFolder(e.target.value)}
                    className="appearance-none rounded border border-border bg-background py-1 pl-7 pr-6 text-[11px] text-foreground"
                  >
                    <option value="">Choose folder…</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select></Tip>
                </div>
              </div>
            )}
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
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              {ownsNoDocs ? (
                <>
                  <p className="text-sm font-medium text-foreground">No documents yet</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    Upload receipts, invoices, payslips, or income statements to Smart Storage
                    and this report will populate automatically.
                  </p>
                  <Link href="/tools/smart-storage">
                    <button className="mt-2 rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                      Go to Smart Storage
                    </button>
                  </Link>
                </>
              ) : folderExcludingEverything ? (
                <>
                  <p className="text-sm font-medium text-foreground">Folder filter is excluding every document in this period</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    No documents in the selected folder match the period {dateFrom || "—"} → {dateTo || "—"}.
                    Clear the folder filter to see all matching data.
                  </p>
                  <button onClick={() => setTargetFolder("")}
                    className="mt-2 rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                    Clear folder filter
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground">No documents in this period</p>
                  <p className="max-w-sm text-xs text-muted-foreground">
                    You have documents on file, but none fall inside {dateFrom || "—"} → {dateTo || "—"}.
                    Pick a different tax year or switch to All Time.
                  </p>
                  <div className="mt-2 flex gap-2">
                    {detectedYears.slice(0, 2).map(y => (
                      <button key={y} onClick={() => applyTaxYear(y)}
                        className="rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                        Tax Year {y}
                      </button>
                    ))}
                    <button onClick={clearPeriod}
                      className="rounded border border-border px-4 py-2 text-xs text-foreground hover:bg-muted">
                      All Time
                    </button>
                  </div>
                </>
              )}
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
                    <Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={copyCSV} title={mixedCurrency ? "CSV includes a mixed-currency warning and per-row currencies" : undefined}>
                      <Copy className="h-3.5 w-3.5" />
                      {csvCopied ? "Copied!" : "Copy CSV"}
                    </Button>
                    <Tip text="Download the summary as a CSV."><Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={downloadCSV} title={mixedCurrency ? "CSV includes a mixed-currency warning and per-row currencies" : undefined}>
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button></Tip>
                    <ReportExportControls report="tax-bundle" dateFrom={dateFrom} dateTo={dateTo} targetFolder={targetFolder} />
                    <Tip text={tier === "free" ? "CSV exports for QuickBooks/Xero are a Pro feature." : quickBooksLayout === "4col" ? "Export for QuickBooks (Date, Description, Credit, Debit)." : "Export for QuickBooks (Date, Description, Amount; expenses negative)."}><Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={() => void downloadAccountingCSV("quickbooks")} disabled={tier === "free"} title={tier === "free" ? "CSV exports for QuickBooks/Xero are a Pro feature." : undefined}>
                      {tier === "free" ? "QuickBooks (upgrade)" : "QuickBooks CSV"}
                    </Button></Tip>
                    <select aria-label="QuickBooks CSV format" value={quickBooksLayout} onChange={(event) => setQuickBooksLayout(event.target.value as "3col" | "4col")} disabled={tier === "free"} className="h-8 rounded border border-border bg-background px-1.5 text-[11px] text-muted-foreground" title="Choose the QuickBooks CSV column layout.">
                      <option value="3col">3-column</option>
                      <option value="4col">4-column</option>
                    </select>
                    <Tip text={tier === "free" ? "CSV exports for QuickBooks/Xero are a Pro feature." : "Export for Xero (Date, Amount, Payee, Description)."}><Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={() => void downloadAccountingCSV("xero")} disabled={tier === "free"} title={tier === "free" ? "CSV exports for QuickBooks/Xero are a Pro feature." : undefined}>
                      {tier === "free" ? "Xero (upgrade)" : "Xero CSV"}
                    </Button></Tip>
                    <Tip text="Open your browser's print dialog to save as PDF."><Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={printReport}>
                      <Printer className="h-3.5 w-3.5" />
                      Print / PDF
                    </Button></Tip>
                    <Tip text="Full evidence bundle — summary CSV, source files, and a manifest."><Button variant="outline" size="sm" className="gap-2 rounded text-xs" onClick={downloadZip} disabled={zipping} title={mixedCurrency ? "ZIP includes a mixed-currency warning, per-row currencies, and a manifest" : undefined}>
                      {zipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                      {zipping ? "Bundling..." : "Download Zip"}
                    </Button></Tip>
                  </div>
                </div>
              </div>

              {/* ── Accountant Review Packet Readiness Check ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Accountant Review Packet Readiness
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
                        {readinessPercent === 100 ? "Ready for accountant review" :
                         readinessPercent >= 50 ? "Almost ready for accountant review — resolve items below" :
                         "Needs cleanup before accountant review"}
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
                        <InfoTip label={check.label} text={readinessDescription(check.label)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── What This Report Is (and isn't) — top-of-report disclosure ── */}
              <div className="rounded border border-border/60 bg-muted/30 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  What this report is
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                  A <strong>tax-preparation worksheet</strong> that cleanses and structures your documented expenses into
                  IRS Schedule C line items, with the 50% statutory haircut applied to Meals (Line 24b). It is designed for
                  <strong> accountant review or guided-interview transcription</strong> into whichever tax preparation tool you
                  or your preparer already use — not for direct file import. It is <strong>not</strong> a tax calculation,
                  not a Line 31 net profit figure, and does not apply self-employment tax, QBI, depreciation elections,
                  home office actuals, vehicle actuals, or any other statutory adjustments.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-foreground/80">
                  Income is partitioned by source: <strong>wage income</strong> (from payslip documents, W-2-like) is shown
                  separately and is <strong>not</strong> used in the Schedule-C-style net calculation —
                  Schedule C business expenses cannot be deducted against W-2 wages.
                  The Schedule-C-style net is derived only from <strong>business income</strong> (from income-statement documents)
                  minus deductible expenses. &ldquo;Payroll Deductions&rdquo; is the gross−net differential from payslips,
                  not verified withholding. Uncategorized rows are excluded from deductible totals; review-flagged rows
                  are included and shown inline. Always hand totals to a licensed preparer before filing.
                </p>
              </div>

              {/* ── Legacy Classification Advisory (pre-v2 rows only) ── */}
              {hasUnclassifiedIncome && (
                <div className="flex items-start gap-3 rounded border border-yellow-500/30 bg-yellow-500/5 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {legacyUnclassifiedIncomeCount} income document{legacyUnclassifiedIncomeCount === 1 ? "" : "s"} missing AI classification
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      These documents were normalized before the income-source classifier was enabled, so they fall back
                      to a document-type heuristic (payslip → wage, income_statement → business). Re-normalize them to
                      get explicit per-document classification and remove this warning.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Wage-Only Negative Result Warning ── */}
              {selfEmploymentGross === 0 && deductibleExpenses > 0 && (
                <div className="flex items-start gap-3 rounded border border-red-500/30 bg-red-500/5 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Negative Schedule-C-style net — no business income detected
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      There are proposed deductible expenses ({fmt(deductibleExpenses, currency)}) but no income-statement
                      documents, so the Estimated Net below is negative. This is <strong>not</strong> a loss you can
                      apply against W-2 wages — Schedule C business expenses cannot be offset against wage income.
                      Either the expenses are not business-related, or an income-statement document is missing.
                      Preparer review required.
                    </p>
                  </div>
                </div>
              )}

              {/* ── Mixed Currency Warning ── */}
              {mixedCurrency && (
                <div className="flex items-start gap-3 rounded border border-red-500/30 bg-red-500/5 p-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Mixed currencies detected ({currencies.join(", ")})
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Only explicit USD rows are included in Tax Bundle math. Non-USD and unspecified rows are excluded below;
                      amounts are <strong>not</strong> FX-converted.
                    </p>
                  </div>
                </div>
              )}

              {excludedNonUsdRows.length > 0 && (
                <div className="rounded border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <FileWarning className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">Excluded — non-USD (not filed)</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {excludedNonUsdRows.length} row{excludedNonUsdRows.length === 1 ? "" : "s"} excluded from USD filing math;
                        no FX conversion was applied.
                      </p>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="text-left text-muted-foreground">
                            <tr><th className="pb-1 pr-4 font-medium">Currency</th><th className="pb-1 pr-4 font-medium">Rows</th><th className="pb-1 text-right font-medium">Raw subtotal</th></tr>
                          </thead>
                          <tbody>
                            {Array.from(excludedNonUsdByCurrency.entries()).map(([excludedCurrency, subtotal]) => (
                              <tr key={excludedCurrency} className="border-t border-amber-500/10">
                                <td className="py-1 pr-4 font-mono">{excludedCurrency}</td>
                                <td className="py-1 pr-4">{excludedNonUsdRows.filter((row) => (row.currency?.trim().toUpperCase() || "UNSPECIFIED") === excludedCurrency).length}</td>
                                <td className="py-1 text-right font-mono">{excludedCurrency === "USD" ? fmt(subtotal, "USD") : `${excludedCurrency} ${subtotal.toFixed(2)}`}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-amber-500/30 font-medium">
                              <td className="pt-1 pr-4">Total excluded</td>
                              <td className="pt-1 pr-4">{excludedNonUsdRows.length}</td>
                              <td className="pt-1 text-right font-mono">{excludedNonUsdRaw.toFixed(2)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Preparer Summary ── */}
              <div className="print:break-inside-avoid">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Preparer Summary
                    </p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      A one-page transcription surface for the Schedule C lines currently present in this packet.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500" /> clean <InfoTip label="clean" text="A mapped row above the review-confidence threshold. It is still a proposal for preparer review." /></span>
                    <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> needs review <InfoTip label="needs review" text="A mapped row with low extraction confidence or another review condition. It remains included in the proposed deductible total." /></span>
                    <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> uncategorized <InfoTip label="uncategorized" text="A row without a Schedule C category. Its raw amount is shown for reconciliation but proposed deductible is zero." /></span>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="border-b border-border bg-muted/20 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Line</th>
                        <th className="px-3 py-2 font-medium">IRS category</th>
                        <th className="px-3 py-2 text-right font-medium">Raw</th>
                        <th className="px-3 py-2 text-right font-medium">Proposed deductible <InfoTip label="Proposed Deductible" text="Our pre-review proposal after the report's conventions, including the 50% meals haircut. The preparer decides whether and how it is used." /></th>
                        <th className="px-3 py-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {sortedScheduleC.map((sc) => (
                        <tr key={sc.line}>
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            <span className="inline-flex items-center gap-1">{sc.line}<InfoTip label={sc.line} text={getScheduleCLineDescription(sc.line)} /></span>
                          </td>
                          <td className="px-3 py-2 text-foreground">{sc.label}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-muted-foreground">{fmt(sc.grossAmount, currency)}</td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">{fmt(sc.amount, currency)}</td>
                          <td className="px-3 py-2 text-right">{sc.reviewCount > 0 ? <span className="text-yellow-500">{sc.reviewCount} review</span> : <span className="text-green-500">clean</span>}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-border font-semibold">
                        <td className="px-3 py-2" colSpan={2}>Totals</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(sortedScheduleC.reduce((sum, sc) => sum + sc.grossAmount, 0), currency)}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(deductibleExpenses, currency)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid gap-2 rounded border border-border/60 bg-muted/10 p-3 text-xs sm:grid-cols-3">
                  <span>Business Income <strong className="float-right font-mono">{fmt(selfEmploymentGross, currency)}</strong></span>
                  <span>Proposed Deductible <strong className="float-right font-mono">{fmt(deductibleExpenses, currency)}</strong></span>
                  <span>Estimated Net <InfoTip label="Estimated Net" text="Business income minus proposed deductible expenses. This is a Schedule-C-style estimate, not Schedule C Line 31 net profit." /><strong className="float-right font-mono">{estimatedNetScheduleC >= 0 ? fmt(estimatedNetScheduleC, currency) : `(${fmt(Math.abs(estimatedNetScheduleC), currency)})`}</strong></span>
                </div>
              </div>

              {/* ── Summary Strip (Schedule C only) ── */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Schedule C Summary
                </p>
                {!hasSelfEmploymentIncome && (hasWageIncome || hasOtherIncome) && (
                  <p className="mb-2 text-[11px] italic text-muted-foreground">
                    No business (self-employment) income detected — the strip below reads zero for the Schedule C base.
                    Wage and other income are surfaced in their own sections below and are <strong>not</strong> Schedule C.
                  </p>
                )}
              <div className="grid grid-cols-1 divide-y divide-border border border-border rounded sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {[
                  {
                    label: "Business Income (Sched C base)",
                    value: fmt(selfEmploymentGross, currency),
                    loss: false,
                  },
                  {
                    label: "Proposed Deductible Expenses",
                    value: fmt(deductibleExpenses, currency),
                    loss: false,
                  },
                  {
                    label: "Estimated Net (Sched C, pre-adjustments)",
                    value: estimatedNetScheduleC >= 0
                      ? fmt(estimatedNetScheduleC, currency)
                      : `(${fmt(Math.abs(estimatedNetScheduleC), currency)})`,
                    loss: estimatedNetScheduleC < 0,
                  },
                ].map(item => (
                  <div key={item.label} className="px-5 py-4">
                    <p className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}{item.label.startsWith("Estimated Net") ? <InfoTip label="Estimated Net" text="Business income minus proposed deductible expenses. This is a Schedule-C-style estimate, not Schedule C Line 31 net profit." /> : item.label.startsWith("Proposed Deductible") ? <InfoTip label="Proposed Deductible" text="Our pre-review proposal after the report's conventions. The preparer decides whether and how it is used." /> : null}</p>
                    <p className={`mt-1.5 font-mono text-base font-medium tabular-nums ${item.loss ? "text-destructive" : "text-foreground"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              </div>

              {/* ── Wage Income (informational, NOT part of Schedule C net) ── */}
              {hasWageIncome && (
                <div className="rounded border border-border/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Wage Income (informational only)
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        From payslip documents. <strong>Not</strong> used in the Schedule-C-style net above —
                        Schedule C business expenses cannot be deducted against W-2 wages.
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-base font-medium tabular-nums text-foreground">
                        {fmt(wageGross, currency)}
                      </p>
                      {wagePayrollDeductions > 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          payroll deductions (gross−net): {fmt(wagePayrollDeductions, currency)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Other Income (non-Schedule-C, non-wage) ── */}
              {hasOtherIncome && (
                <div className="rounded border border-border/60 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        Other Income (informational only)
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Investment, rental, interest, and other non-business income. <strong>Not</strong> offset by
                        Schedule C expenses and <strong>not</strong> included in the Estimated Net above.
                        These amounts flow to other parts of Form 1040 (Schedule B, Schedule E, etc.).
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-base font-medium tabular-nums text-foreground">
                        {fmt(otherIncomeGross, currency)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {otherIncomeRows.length} document{otherIncomeRows.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {otherIncomeByType.size > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {Array.from(otherIncomeByType.entries()).map(([type, amount]) => (
                        <div key={type} className="rounded border border-border/40 px-3 py-2">
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                            {prettyIncomeClass(type)}
                          </p>
                          <p className="mt-0.5 font-mono text-xs tabular-nums text-foreground">
                            {fmt(amount, currency)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

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
                            <div key={item.record_id ?? item.file_id} className="flex flex-wrap items-center gap-2 rounded border border-border/50 bg-background/50 p-2">
                                <span className="min-w-0 flex-1 truncate text-xs text-foreground" title={item.filename}>
                                  {item.vendor_name ?? item.filename}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  {fmt(item.total_amount ?? 0, currency)}
                                </span>
                                <select
                                  className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                                  value={reassigning[item.record_id ?? item.file_id] ?? ""}
                                  onChange={e => setReassigning(prev => ({ ...prev, [item.record_id ?? item.file_id]: e.target.value }))}
                                >
                                  <option value="">Select category...</option>
                                  {ALL_SC_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat} ({getScheduleCLine(cat)})</option>
                                  ))}
                                </select>
                                {reassigning[item.record_id ?? item.file_id] && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 gap-1 rounded px-2 text-[10px]"
                                    onClick={() => saveCategory(item.record_id, reassigning[item.record_id ?? item.file_id])}
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
                        <th className="pb-2 font-medium">Source</th>
                        <th className="pb-2 font-medium">Type</th>
                        <th className="pb-2 text-right font-medium">Gross Income</th>
                        <th className="pb-2 text-right font-medium">Net Income</th>
                        <th className="pb-2 text-right font-medium">Payroll Deductions <InfoTip label="Payroll Deductions" text="Gross minus net on payslip rows. This is an informational differential, not verified withholding." /></th>
                        <th className="pb-2 text-right font-medium">Docs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {Array.from(incomeByEmployer.entries()).map(([key, data]) => {
                        const [, , name] = key.split("|")
                        const isWage = data.cls === "wage"
                        const isBusiness = data.cls === "business"
                        const badgeClass = isWage
                          ? "bg-muted text-muted-foreground"
                          : isBusiness
                            ? "bg-primary/10 text-primary"
                            : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500"
                        return (
                          <tr key={key}>
                            <td className="py-2.5 text-foreground">{name}</td>
                            <td className="py-2.5">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${badgeClass}`}>
                                {prettyIncomeClass(data.cls)}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              {fmt(data.gross, currency)}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              {data.net > 0 ? fmt(data.net, currency) : "—"}
                            </td>
                            <td className="py-2.5 text-right font-mono tabular-nums text-foreground">
                              {data.payrollDeductions > 0 ? fmt(data.payrollDeductions, currency) : "—"}
                            </td>
                            <td className="py-2.5 text-right text-muted-foreground">{data.docs}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      {/* Render an explicit subtotal for every bucket that
                          contributes to the bookkeeping total — wage, business,
                          other — so readers can reconcile the footer row-by-row
                          regardless of which combinations are present. */}
                      {((hasWageIncome ? 1 : 0) + (hasSelfEmploymentIncome ? 1 : 0) + (hasOtherIncome ? 1 : 0)) >= 2 && (
                        <>
                          {hasWageIncome && (
                            <tr className="border-t border-border/60">
                              <td className="pt-2 text-xs text-muted-foreground">Wage subtotal</td>
                              <td />
                              <td className="pt-2 text-right font-mono tabular-nums text-xs text-muted-foreground">{fmt(wageGross, currency)}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                          {hasSelfEmploymentIncome && (
                            <tr>
                              <td className="pt-1 text-xs text-muted-foreground">Business subtotal</td>
                              <td />
                              <td className="pt-1 text-right font-mono tabular-nums text-xs text-muted-foreground">{fmt(selfEmploymentGross, currency)}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                          {hasOtherIncome && (
                            <tr>
                              <td className="pt-1 text-xs text-muted-foreground">Other income subtotal</td>
                              <td />
                              <td className="pt-1 text-right font-mono tabular-nums text-xs text-muted-foreground">{fmt(otherIncomeGross, currency)}</td>
                              <td colSpan={3} />
                            </tr>
                          )}
                        </>
                      )}
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5 text-foreground">Total (bookkeeping)</td>
                        <td />
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">{fmt(totalGross, currency)}</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          {wageNet > 0 ? fmt(wageNet, currency) : "—"}
                        </td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          {wagePayrollDeductions > 0 ? fmt(wagePayrollDeductions, currency) : "—"}
                        </td>
                        <td className="pt-2.5 text-right text-muted-foreground">{incomeRows.length}</td>
                      </tr>
                      <tr>
                        <td colSpan={6} className="pt-1 text-[10px] text-muted-foreground/70">
                          Net Income and Payroll Deductions apply to wage (payslip) rows only. Business rows have no
                          net figure — only gross is meaningful.
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── Schedule C Expense Breakdown ── */}
              {sortedScheduleC.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Schedule C — Expense Breakdown
                  </p>
                  <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                    This table is the primary transcription surface — each row corresponds to a Schedule C
                    Part II line and the proposed deductible column is what you or your preparer would review (or read
                    aloud during a guided interview) into a tax preparation tool. Line 13 rows default to
                    depreciation / §179; items under the <strong>$2,500 de minimis safe harbor</strong> may be
                    directly expensed instead — confirm with your preparer.
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                        <th className="pb-2 font-medium">Line</th>
                        <th className="pb-2 font-medium">IRS Category</th>
                        <th className="pb-2 text-right font-medium">Raw</th>
                        <th className="pb-2 text-right font-medium">Proposed Deductible <InfoTip label="Proposed Deductible" text="Our pre-review proposal after the report's conventions, including the 50% meals haircut. The preparer decides whether and how it is used." /></th>
                        <th className="pb-2 text-right font-medium">Items</th>
                        <th className="pb-2 text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {sortedScheduleC.map(sc => (
                        <tr key={sc.line}>
                          <td className="py-2.5 font-mono text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">{sc.line}<InfoTip label={sc.line} text={getScheduleCLineDescription(sc.line)} /></span>
                          </td>
                          <td className="py-2.5 text-foreground">
                            {sc.label}
                            {sc.line === "Line 24b" && (
                              <span className="ml-1.5 text-[10px] text-yellow-500">× 50%</span>
                            )}
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                            {fmt(sc.grossAmount, currency)}
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
                      {uncategorizedItems.length > 0 && (
                        <tr className="bg-muted/10 text-muted-foreground">
                          <td className="py-2.5 font-mono text-xs">—</td>
                          <td className="py-2.5">
                            <span className="inline-flex items-center gap-1">Uncategorized (excluded from deductible)<InfoTip label="uncategorized" text="These expenses have no Schedule C category in our mapping. Their raw amount is included for reconciliation, but proposed deductible is $0 until a preparer reclassifies them." /></span>
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{fmt(uncategorizedItems.reduce((sum, row) => sum + (row.total_amount ?? 0), 0), currency)}</td>
                          <td className="py-2.5 text-right font-mono tabular-nums">{fmt(0, currency)}</td>
                          <td className="py-2.5 text-right">{uncategorizedItems.length}</td>
                          <td className="py-2.5 text-right"><span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px]">excluded</span></td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold">
                        <td className="pt-2.5" />
                        <td className="pt-2.5 text-foreground">Proposed Deductible Expenses</td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-muted-foreground">
                          {fmt(totalExpensesRaw, currency)}
                        </td>
                        <td className="pt-2.5 text-right font-mono tabular-nums text-foreground">
                          ({fmt(deductibleExpenses, currency)})
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
                          <td className="px-4 pt-2.5 pb-3 text-foreground">Annual Total (raw)</td>
                          <td className="px-4 pt-2.5 pb-3 text-right font-mono tabular-nums text-foreground">
                            {fmt(totalExpensesRaw, currency)}
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

              {/* ── Pre-filing Expense Summary ── */}
              <div>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Pre-filing Expense Summary
                </p>
                <div className="rounded border border-border p-6">
                  <table className="w-full text-sm">
                    <colgroup>
                      <col />
                      <col style={{ width: "13rem" }} />
                    </colgroup>
                    <tbody>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Business Income (income statements)</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">{fmt(selfEmploymentGross, currency)}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-foreground/80">Less: Schedule C proposed deductible expenses</td>
                        <td className="py-1.5 text-right font-mono tabular-nums text-foreground">({fmt(deductibleExpenses, currency)})</td>
                      </tr>
                      {reviewDeductibleExpenses > 0 && (
                        <>
                          <tr>
                            <td className="py-1.5 pl-4 text-xs text-muted-foreground">
                              clean proposed subtotal
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-xs text-muted-foreground">
                              ({fmt(cleanDeductibleExpenses, currency)})
                            </td>
                          </tr>
                          <tr>
                            <td className="py-1.5 pl-4 text-xs text-yellow-600">
                              needs-review proposed subtotal
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-xs text-yellow-600">
                              ({fmt(reviewDeductibleExpenses, currency)})
                            </td>
                          </tr>
                        </>
                      )}
                      {uncategorizedItems.length > 0 && (
                        <tr>
                          <td className="py-1.5 pl-4 text-xs text-muted-foreground">
                            uncategorized excluded from proposed deductible totals
                          </td>
                          <td className="py-1.5 text-right font-mono tabular-nums text-xs text-muted-foreground">
                            ({fmt(uncategorizedItems.reduce((s, r) => s + (r.total_amount ?? 0), 0), currency)})
                          </td>
                        </tr>
                      )}
                      {mealsGross > 0 && (
                        <tr>
                          <td className="py-1.5 pl-4 text-xs text-muted-foreground">
                            includes Meals raw {fmt(mealsGross, currency)} → deductible {fmt(mealsDeductible, currency)} (50%)
                          </td>
                          <td />
                        </tr>
                      )}
                      <tr className="border-t border-border">
                        <td className="py-2 font-semibold text-foreground">Estimated Net (Schedule C, before adjustments)</td>
                        <td className={`py-2 text-right font-mono tabular-nums font-semibold ${estimatedNetScheduleC < 0 ? "text-destructive" : "text-foreground"}`}>
                          {estimatedNetScheduleC >= 0
                            ? fmt(estimatedNetScheduleC, currency)
                            : `(${fmt(Math.abs(estimatedNetScheduleC), currency)})`}
                        </td>
                      </tr>
                      {hasWageIncome && (
                        <>
                          <tr><td colSpan={2} className="py-2" /></tr>
                          <tr>
                            <td className="py-1.5 text-xs text-muted-foreground">
                              Wage Income (payslips — <strong>not</strong> offset by Schedule C expenses)
                            </td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                              {fmt(wageGross, currency)}
                            </td>
                          </tr>
                        </>
                      )}
                      {wagePayrollDeductions > 0 && (
                        <>
                          <tr><td colSpan={2} className="py-2" /></tr>
                          <tr>
                            <td className="py-1.5 text-foreground/80">Payroll Deductions (Gross − Net, informational) <InfoTip label="Payroll Deductions" text="Gross minus net on payslip rows. This is an informational differential, not verified withholding." /></td>
                            <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                              ({fmt(wagePayrollDeductions, currency)})
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-4 text-[10px] text-muted-foreground/60">
                    <strong>Not a tax calculation.</strong> This is a pre-filing summary of documented income and deductible expenses.
                    It does not account for self-employment tax, QBI, half-SE deduction, estimated payments, credits, or brackets —
                    and the Payroll Deductions figure is the gross−net differential on payslips, not verified withholding from a W-2/1099.
                    Schedule C Line 31 (net profit) is computed by your tax software or preparer. Meals (Line 24b) are halved here;
                    other statutory adjustments are not applied.
                  </p>
                </div>
              </div>

              {/* ── Supporting Documents ── */}
              {rows.length > 0 && (
                <div className="border-t border-border pt-6">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Audit Trail — Supporting Documents ({incomeRows.length + expenseRows.length} listed{excludedNonUsdRows.length > 0 ? `; ${excludedNonUsdRows.length} excluded non-USD` : ""})
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
                        <th className="pb-2 font-medium">Review Notes</th>
                        <th className="pb-2 text-right font-medium">Confidence</th>
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
                              {fmt(getTaxRowAmount(r), r.currency ?? currency)}
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
                            <td className="py-2 max-w-[220px] text-muted-foreground">
                              {isExpense
                                ? (getReviewReason(r) || getSubstantiationNotes(r) || "—")
                                : (r.classification_rationale ?? "—")}
                            </td>
                            <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">
                              {r.confidence_score != null ? `${Math.round(r.confidence_score * 100)}%` : "—"}
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
                  This report maps documented expenses to IRS Schedule C (Form 1040) line items for self-employment income.
                  It is not tax advice and does not constitute an official filing document or a Line 31 calculation.
                  The Schedule-C-style net is computed from <strong>business income only</strong> (income-statement documents).
                  Wage income from payslip documents is shown separately and is <strong>not</strong> netted against Schedule C expenses —
                  W-2 wages are reported on Form 1040 Line 1a and cannot be offset by business expenses.
                  Deductible expenses exclude uncategorized items and apply the statutory 50% haircut to Meals (Line 24b);
                  no other statutory adjustments (SE tax, QBI, depreciation elections, home office, vehicle actuals) are applied.
                  &ldquo;Payroll Deductions&rdquo; is the gross minus net differential on payslips and is <strong>not</strong> verified withholding —
                  use the amounts on W-2/1099 forms when filing.
                  Mixed currencies are not FX-converted; convert before filing.
                  Items flagged &ldquo;Needs Review&rdquo; may contain personal expenses or have low AI confidence.
                  Always consult a licensed tax professional before filing. This worksheet is designed for accountant review or for transcription into a tax preparation tool — not for direct file import.
                </p>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default function TaxBundlePage() {
  return (
    <Suspense fallback={null}>
      <TaxBundleContent />
    </Suspense>
  )
}
