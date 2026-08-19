import { generateQuickBooksCSV, generateXeroCSV, type AccountingExportRow } from "@/lib/accounting-csv"
import { computeTaxBundle, type TaxRow } from "@/lib/tax-bundle"
import { type Entitlement } from "@/lib/entitlement"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { overlapsDateRange } from "@/lib/report-utils"
import { selectTaxBundleDefaultYear } from "@/lib/tax-bundle-default-year"
import { isExportableExpenseRow, isExpenseRow, isUsdRow } from "@/lib/document-classification"
import { getReportFileIds } from "@/lib/report-folder-scope-server"

export type ReportFilters = { dateFrom?: string; dateTo?: string; targetFolder?: string }
export type ExportTarget = "quickbooks_3col" | "quickbooks_4col" | "xero"

function inPeriod(row: { document_date?: string | null; period_start?: string | null; period_end?: string | null }, filters: ReportFilters) {
  return overlapsDateRange(row, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" })
}

async function taxRows(userId: string, filters: ReportFilters): Promise<TaxRow[]> {
  const fileIds = await getReportFileIds(userId, [], filters.targetFolder)
  if (filters.targetFolder && fileIds.length === 0) return []

  let query = supabaseAdmin
    .from("document_fields")
    .select("file_id, vendor_name, vendor_normalized, employer_name, document_date, period_start, period_end, total_amount, gross_income, net_income, expense_category, currency, income_source, classification_rationale, jurisdiction, confidence_score, raw_json, files!inner(filename, document_type, storage_path, user_id)")
    .eq("files.user_id", userId)
    .neq("normalization_status", "excluded")
    .order("document_date", { ascending: false })
  if (fileIds.length > 0) query = query.in("file_id", fileIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).filter((row) => inPeriod(row, filters)).map((row: any) => ({
    ...row,
    filename: row.files?.[0]?.filename ?? row.files?.filename ?? "document",
    document_type: row.files?.[0]?.document_type ?? row.files?.document_type ?? "unknown",
    storage_path: row.files?.[0]?.storage_path ?? row.files?.storage_path ?? null,
  }))
}

export async function getReport(userId: string, _entitlement: Entitlement, report: "tax-bundle" | "business-expense", filters: ReportFilters = {}) {
  const rows = await taxRows(userId, filters)
  if (report === "business-expense") {
    return { expenses: rows.filter((row) => isExpenseRow(row) && isUsdRow(row)) }
  }
  const detectedYears = Array.from(new Set(rows.flatMap((row) => [row.period_end, row.period_start, row.document_date].filter((value): value is string => Boolean(value)).map((value) => Number(value.slice(0, 4))).filter((value) => Number.isFinite(value))))).sort((a, b) => b - a)
  const defaultYear = selectTaxBundleDefaultYear(detectedYears, rows)
  return { rows, totalOwnedDocs: rows.length, detectedYears, defaultYear, summary: computeTaxBundle(rows) }
}

export async function getExport(userId: string, entitlement: Entitlement, report: "tax-bundle" | "business-expense", target: ExportTarget, filters: ReportFilters = {}) {
  const result = await getReport(userId, entitlement, report, filters)
  const rows = ("expenses" in result && result.expenses ? result.expenses : result.rows)
    .filter((row) => isExportableExpenseRow(row) && isUsdRow(row))
    .map((row): AccountingExportRow => ({ document_date: row.document_date, vendor_name: row.vendor_name, expense_category: row.expense_category, total_amount: row.total_amount }))
  if (target === "xero") return generateXeroCSV(rows)
  return generateQuickBooksCSV(rows, target === "quickbooks_4col" ? "4col" : "3col")
}
