import { generateQuickBooksCSV, generateXeroCSV } from "@/lib/accounting-csv"
import { computeTaxBundle, type IncomeSourceClass, type TaxRow } from "@/lib/tax-bundle"
import { type Entitlement } from "@/lib/entitlement"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { overlapsDateRange } from "@/lib/report-utils"
import { selectTaxBundleDefaultYear } from "@/lib/tax-bundle-default-year"
import { isExpenseRow, isUsdRow } from "@/lib/document-classification"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { accountingExportRows } from "@/lib/report-export-shaping"

export type ReportFilters = { dateFrom?: string; dateTo?: string; targetFolder?: string }
export type ExportTarget = "quickbooks_3col" | "quickbooks_4col" | "xero"

function inPeriod(row: { document_date?: string | null; period_start?: string | null; period_end?: string | null }, filters: ReportFilters) {
  return overlapsDateRange(row, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" })
}

async function legacyTaxRows(userId: string, filters: ReportFilters): Promise<TaxRow[]> {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds()
  if (filters.targetFolder && fileIds.length === 0) return []

  let query = supabaseAdmin
    .from("document_fields")
    .select("file_id, vendor_name, vendor_normalized, employer_name, document_date, period_start, period_end, total_amount, gross_income, net_income, expense_category, currency, income_source, classification_rationale, jurisdiction, confidence_score, files!inner(filename, document_type, storage_path, user_id)")
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

type RecordRow = {
  id: string
  file_id: string
  source_key: string
  parent_record_id: string | null
  document_type: string | null
  occurred_on: string | null
  period_start: string | null
  period_end: string | null
  amount: number | string | null
  currency: string | null
  counterparty: string | null
  counterparty_normalized: string | null
  category: string | null
  confidence: number | string | null
  files: unknown
}

type RecordAttribute = { record_id: string; field_key: string; value: unknown }

function nestedFileValue(files: unknown, key: string): unknown {
  const file = Array.isArray(files) ? files[0] : files
  return file && typeof file === "object" ? (file as Record<string, unknown>)[key] : null
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value)
}

const INCOME_SOURCE_CLASSES = new Set<IncomeSourceClass>(["business", "wage", "investment", "rental", "interest", "other"])

function incomeSourceValue(value: unknown): IncomeSourceClass | null {
  const candidate = stringValue(value)
  return candidate && INCOME_SOURCE_CLASSES.has(candidate as IncomeSourceClass)
    ? candidate as IncomeSourceClass
    : null
}

function recordAttributeMap(attributes: RecordAttribute[]) {
  const byRecord = new Map<string, Map<string, unknown>>()
  for (const attribute of attributes) {
    const fields = byRecord.get(attribute.record_id) ?? new Map<string, unknown>()
    fields.set(attribute.field_key, attribute.value)
    byRecord.set(attribute.record_id, fields)
  }
  return byRecord
}

async function recordsTaxRows(userId: string, filters: ReportFilters): Promise<TaxRow[]> {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds()
  if (filters.targetFolder && fileIds.length === 0) return []

  let query = supabaseAdmin
    .from("records")
    .select("id, file_id, source_key, parent_record_id, document_type, occurred_on, period_start, period_end, amount, currency, counterparty, counterparty_normalized, category, confidence, files!inner(filename, document_type, storage_path, user_id)")
    .eq("user_id", userId)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .order("occurred_on", { ascending: false })
  if (fileIds.length > 0) query = query.in("file_id", fileIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = (data ?? []) as RecordRow[]
  const recordIds = records.map((record) => record.id)
  const { data: attributes, error: attributesError } = recordIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin
      .from("record_attributes")
      .select("record_id, field_key, value")
      .in("record_id", recordIds)
  if (attributesError) throw new Error(attributesError.message)
  const attrs = recordAttributeMap((attributes ?? []) as RecordAttribute[])

  return records
    .filter((record) => inPeriod({
      document_date: record.occurred_on,
      period_start: record.period_start,
      period_end: record.period_end,
    }, filters))
    .map((record) => {
      const fields = attrs.get(record.id) ?? new Map<string, unknown>()
      const get = (key: string) => fields.get(key)
      const files = record.files
      const documentType = record.document_type ?? stringValue(nestedFileValue(files, "document_type")) ?? "unknown"
      return {
        file_id: record.file_id,
        filename: stringValue(nestedFileValue(files, "filename")) ?? "document",
        document_type: documentType,
        vendor_name: stringValue(get("vendor_name")),
        vendor_normalized: stringValue(record.counterparty_normalized),
        employer_name: stringValue(get("employer_name")),
        document_date: stringValue(record.occurred_on),
        period_start: stringValue(record.period_start),
        period_end: stringValue(record.period_end),
        total_amount: numberValue(record.amount),
        gross_income: numberValue(get("gross_income") ?? (documentType === "payslip" ? record.amount : null)),
        net_income: numberValue(get("net_income")),
        expense_category: stringValue(record.category),
        income_source: incomeSourceValue(get("income_source")),
        classification_rationale: stringValue(get("classification_rationale")),
        jurisdiction: stringValue(get("jurisdiction")),
        currency: stringValue(record.currency),
        confidence_score: numberValue(record.confidence),
        storage_path: stringValue(nestedFileValue(files, "storage_path")),
      }
    })
}

async function taxRows(userId: string, filters: ReportFilters): Promise<TaxRow[]> {
  return recordsTaxRows(userId, filters)
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
  const rows = accountingExportRows("expenses" in result && result.expenses ? result.expenses : result.rows)
  if (target === "xero") return generateXeroCSV(rows)
  return generateQuickBooksCSV(rows, target === "quickbooks_4col" ? "4col" : "3col")
}
