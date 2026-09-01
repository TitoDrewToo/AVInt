// Compare the current document_fields report path with a records-backed path.
// This is intentionally a local, read-only diagnostic. It does not change the
// report engine or write to Supabase.
//
// Usage:
//   node --env-file=.env.local --import tsx scripts/report-parity.ts \
//     <user-id-or-email> <date-from> <date-to> [folder-id] <report-key>

import { supabaseAdmin } from "@/lib/mcp-auth"
import { computeTaxBundle, getTaxRowAmount, type TaxRow } from "@/lib/tax-bundle"
import { isExpenseRow, isUsdRow } from "@/lib/document-classification"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { overlapsDateRange } from "@/lib/report-utils"
import { selectTaxBundleDefaultYear } from "@/lib/tax-bundle-default-year"

type ReportKey = "tax-bundle" | "business-expense" | "expense-summary" | "income-summary" | "profit-loss" | "contract-summary"
type ReportFilters = { dateFrom?: string; dateTo?: string; targetFolder?: string }
type JsonObject = Record<string, unknown>
type Identity = { file_id: string; source_key: string }
type IdentifiedRow = { identity: Identity; occurredOn: string | null; row: TaxRow }

const FIELD_MAPPINGS = {
  gross_income: "gross_income",
  net_income: "net_income",
  income_source: "income_source",
  classification_rationale: "classification_rationale",
  jurisdiction: "jurisdiction",
  raw_json: "_raw_json",
} as const

const args = process.argv.slice(2)
const [userInput, dateFrom, dateTo] = args
const reportKey = (args.at(-1) ?? "") as ReportKey
const targetFolder = args.length === 5 ? args[3] : undefined

if (!userInput || !dateFrom || !dateTo || !["tax-bundle", "business-expense", "expense-summary", "income-summary", "profit-loss", "contract-summary"].includes(reportKey) || (args.length !== 4 && args.length !== 5)) {
  console.error("Usage: report-parity <user-id-or-email> <date-from> <date-to> [folder-id] <tax-bundle|business-expense|expense-summary|income-summary|profit-loss|contract-summary>")
  process.exit(2)
}

async function resolveUserId(input: string): Promise<string> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) return input

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const match = data.users.find((user) => user.email?.toLowerCase() === input.toLowerCase())
    if (match) return match.id
    if (data.users.length < 1000) break
  }
  throw new Error(`No auth user found for ${input}`)
}

function fileValue(files: unknown, key: string): unknown {
  const file = Array.isArray(files) ? files[0] : files
  return file && typeof file === "object" ? (file as JsonObject)[key] : null
}

function valueAsNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function valueAsString(value: unknown): string | null {
  return typeof value === "string" ? value : value == null ? null : String(value)
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function attributeMap(rows: Array<{ record_id: string; field_key: string; value: unknown }>) {
  const byRecord = new Map<string, Map<string, unknown>>()
  for (const row of rows) {
    const fields = byRecord.get(row.record_id) ?? new Map<string, unknown>()
    fields.set(row.field_key, row.value)
    byRecord.set(row.record_id, fields)
  }
  return byRecord
}

async function recordsRows(userId: string, filters: ReportFilters): Promise<IdentifiedRow[]> {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds()
  if (filters.targetFolder && fileIds.length === 0) return []

  let query = supabaseAdmin
    .from("records")
    .select("id, file_id, source_key, parent_record_id, record_type, document_type, occurred_on, period_start, period_end, amount, currency, counterparty, counterparty_normalized, category, confidence, files!inner(filename, document_type, storage_path, user_id)")
    .eq("user_id", userId)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .order("occurred_on", { ascending: false })
  if (fileIds.length > 0) query = query.in("file_id", fileIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = data ?? []
  const recordIds = records.map((row) => row.id)

  const { data: attributes, error: attributesError } = recordIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", recordIds)
  if (attributesError) throw new Error(attributesError.message)
  const attrs = attributeMap(attributes ?? [])

  return records
    .filter((row) => overlapsDateRange({
      document_date: row.occurred_on,
      period_start: row.period_start,
      period_end: row.period_end,
    }, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" }))
    .map((row) => {
      const fields = attrs.get(row.id) ?? new Map<string, unknown>()
      const get = (key: string) => fields.get(key)
      const files = row.files
      const documentType = row.document_type ?? valueAsString(fileValue(files, "document_type")) ?? "unknown"
      const isPayslip = documentType === "payslip"
      const rawJson = parseJsonValue(get(FIELD_MAPPINGS.raw_json))
      const rawTotalAmount = rawJson && typeof rawJson === "object"
        ? valueAsNumber((rawJson as JsonObject).total_amount)
        : null
      const vendorName = valueAsString(get("vendor_name"))
      const employerName = valueAsString(get("employer_name"))
      const mapped = {
        file_id: row.file_id,
        filename: valueAsString(fileValue(files, "filename")) ?? "document",
        document_type: documentType,
        vendor_name: vendorName,
        vendor_normalized: valueAsString(row.counterparty_normalized),
        employer_name: employerName,
        document_date: valueAsString(row.occurred_on),
        period_start: valueAsString(row.period_start),
        period_end: valueAsString(row.period_end),
        // Known inconsistency: legacy payslips fall back to gross_income when
        // their legacy total_amount is null. Preserve that behavior here;
        // changing payslip contribution semantics is a separate change.
        total_amount: isPayslip ? rawTotalAmount : valueAsNumber(row.amount),
        gross_income: valueAsNumber(get(FIELD_MAPPINGS.gross_income)),
        net_income: isPayslip ? valueAsNumber(row.amount) : valueAsNumber(get(FIELD_MAPPINGS.net_income)),
        expense_category: valueAsString(row.category),
        income_source: valueAsString(get(FIELD_MAPPINGS.income_source)),
        classification_rationale: valueAsString(get(FIELD_MAPPINGS.classification_rationale)),
        jurisdiction: valueAsString(get(FIELD_MAPPINGS.jurisdiction)),
        currency: valueAsString(row.currency),
        confidence_score: valueAsNumber(row.confidence),
        storage_path: valueAsString(fileValue(files, "storage_path")),
        files,
        raw_json: rawJson ?? null,
      } satisfies TaxRow & { files: unknown }
      return { identity: { file_id: row.file_id, source_key: row.source_key }, occurredOn: valueAsString(row.occurred_on), row: mapped }
    })
}

async function legacyReportRows(userId: string, filters: ReportFilters): Promise<TaxRow[]> {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds()
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
  return (data ?? [])
    .filter((row) => overlapsDateRange(row, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" }))
    .map((row) => ({
      ...row,
      filename: valueAsString(fileValue(row.files, "filename")) ?? "document",
      document_type: valueAsString(fileValue(row.files, "document_type")) ?? "unknown",
      storage_path: valueAsString(fileValue(row.files, "storage_path")),
    }))
}

async function expenseSummaryRows(userId: string, filters: ReportFilters, source: "document_fields" | "records") {
  const documentTypes = ["receipt", "invoice"]
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds(documentTypes)
  if (fileIds.length === 0) return []

  if (source === "document_fields") {
    let query = supabaseAdmin.from("document_fields")
      .select("file_id, vendor_name, document_date, total_amount, currency, expense_category, confidence_score, files!inner(filename, document_type)")
      .neq("normalization_status", "excluded")
      .order("document_date", { ascending: false })
    if (fileIds.length > 0) query = query.in("file_id", fileIds)
    if (filters.dateFrom) query = query.gte("document_date", filters.dateFrom)
    if (filters.dateTo) query = query.lte("document_date", filters.dateTo)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  }

  let query = supabaseAdmin.from("records")
    .select("id, file_id, parent_record_id, document_type, occurred_on, amount, currency, category, confidence, files!inner(filename, document_type)")
    .in("file_id", fileIds)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .order("occurred_on", { ascending: false })
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = data ?? []
  const { data: attributes, error: attributesError } = records.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", records.map((row) => row.id)).eq("field_key", "vendor_name")
  if (attributesError) throw new Error(attributesError.message)
  const vendorByRecord = new Map((attributes ?? []).map((row) => [row.record_id, row.value]))
  return records.filter((row) => (!filters.dateFrom || row.occurred_on >= filters.dateFrom) && (!filters.dateTo || row.occurred_on <= filters.dateTo)).map((row) => ({
    file_id: row.file_id,
    vendor_name: vendorByRecord.get(row.id) ?? null,
    document_date: row.occurred_on,
    total_amount: row.amount,
    currency: row.currency,
    expense_category: row.category,
    confidence_score: row.confidence,
    files: row.files,
  }))
}

async function incomeSummaryRows(userId: string, filters: ReportFilters, source: "document_fields" | "records") {
  const documentTypes = ["payslip", "income_statement"]
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds(documentTypes)
  if (fileIds.length === 0) return []

  if (source === "document_fields") {
    let query = supabaseAdmin.from("document_fields")
      .select("file_id, employer_name, document_date, gross_income, net_income, total_amount, currency, confidence_score, income_source, files!inner(filename, document_type)")
      .neq("normalization_status", "excluded")
      .order("document_date", { ascending: false })
    query = query.in("file_id", fileIds)
    if (filters.dateFrom) query = query.gte("document_date", filters.dateFrom)
    if (filters.dateTo) query = query.lte("document_date", filters.dateTo)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  }

  let query = supabaseAdmin.from("records")
    .select("id, file_id, document_type, occurred_on, amount, currency, confidence, files!inner(filename, document_type)")
    .in("file_id", fileIds)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .order("occurred_on", { ascending: false })
  if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom)
  if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = data ?? []
  const { data: attributes, error: attributesError } = records.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", records.map((row) => row.id)).in("field_key", ["employer_name", "gross_income", "net_income", "income_source", "_raw_json"])
  if (attributesError) throw new Error(attributesError.message)
  const byRecord = new Map<string, Map<string, unknown>>()
  for (const attribute of attributes ?? []) byRecord.set(attribute.record_id, new Map([...(byRecord.get(attribute.record_id) ?? []), [attribute.field_key, attribute.value]]))
  return records.map((row) => {
    const fields = byRecord.get(row.id) ?? new Map<string, unknown>()
    const raw = parseJsonValue(fields.get("_raw_json"))
    const rawTotal = raw && typeof raw === "object" ? valueAsNumber((raw as JsonObject).total_amount) : null
    const isPayslip = (row.document_type ?? valueAsString(fileValue(row.files, "document_type"))) === "payslip"
    return {
      file_id: row.file_id,
      employer_name: valueAsString(fields.get("employer_name")),
      document_date: row.occurred_on,
      gross_income: valueAsNumber(fields.get("gross_income")),
      net_income: isPayslip ? valueAsNumber(row.amount) : valueAsNumber(fields.get("net_income")),
      total_amount: isPayslip ? rawTotal : valueAsNumber(row.amount),
      currency: row.currency,
      confidence_score: row.confidence,
      income_source: valueAsString(fields.get("income_source")),
      files: row.files,
    }
  })
}

async function profitLossRows(userId: string, filters: ReportFilters, source: "document_fields" | "records") {
  const context = await createReportQueryContext(userId, filters)
  const incomeFileIds = await context.fileIds(["payslip", "income_statement"])
  const expenseFileIds = await context.fileIds(["receipt", "invoice"])
  if (source === "document_fields") {
    const incomeRows = incomeFileIds.length === 0 ? [] : await (async () => {
      let query = supabaseAdmin.from("document_fields").select("document_date, gross_income, net_income, total_amount, currency, employer_name, income_source, files!inner(document_type)").in("file_id", incomeFileIds).neq("normalization_status", "excluded").order("document_date", { ascending: true })
      if (filters.dateFrom) query = query.gte("document_date", filters.dateFrom)
      if (filters.dateTo) query = query.lte("document_date", filters.dateTo)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data ?? []
    })()
    const expenseRows = expenseFileIds.length === 0 ? [] : await (async () => {
      let query = supabaseAdmin.from("document_fields").select("document_date, total_amount, currency, vendor_name, expense_category, files!inner(document_type)").in("file_id", expenseFileIds).neq("normalization_status", "excluded").order("document_date", { ascending: true })
      if (filters.dateFrom) query = query.gte("document_date", filters.dateFrom)
      if (filters.dateTo) query = query.lte("document_date", filters.dateTo)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return data ?? []
    })()
    return { incomeRows, expenseRows }
  }

  const queryRecords = async (fileIds: string[]) => {
    if (fileIds.length === 0) return []
    let query = supabaseAdmin.from("records").select("id, file_id, document_type, occurred_on, amount, currency, category, confidence, files!inner(document_type)").in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: true })
    if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom)
    if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data ?? []
  }
  const incomeRecords = await queryRecords(incomeFileIds)
  const expenseRecords = await queryRecords(expenseFileIds)
  const allRecords = [...incomeRecords, ...expenseRecords]
  const { data: attributes, error: attributesError } = allRecords.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", allRecords.map((row) => row.id)).in("field_key", ["employer_name", "vendor_name", "gross_income", "net_income", "income_source", "_raw_json"])
  if (attributesError) throw new Error(attributesError.message)
  const byRecord = new Map<string, Map<string, unknown>>()
  for (const attribute of attributes ?? []) byRecord.set(attribute.record_id, new Map([...(byRecord.get(attribute.record_id) ?? []), [attribute.field_key, attribute.value]]))
  const incomeRows = incomeRecords.map((row) => {
    const fields = byRecord.get(row.id) ?? new Map<string, unknown>()
    const raw = parseJsonValue(fields.get("_raw_json"))
    const rawTotal = raw && typeof raw === "object" ? valueAsNumber((raw as JsonObject).total_amount) : null
    const isPayslip = (row.document_type ?? valueAsString(fileValue(row.files, "document_type"))) === "payslip"
    return { document_date: row.occurred_on, gross_income: valueAsNumber(fields.get("gross_income")), net_income: isPayslip ? valueAsNumber(row.amount) : valueAsNumber(fields.get("net_income")), total_amount: isPayslip ? rawTotal : valueAsNumber(row.amount), currency: row.currency, employer_name: fields.get("employer_name") ?? null, income_source: fields.get("income_source") ?? null, files: row.files }
  })
  const expenseRows = expenseRecords.map((row) => {
    const fields = byRecord.get(row.id) ?? new Map<string, unknown>()
    return { document_date: row.occurred_on, total_amount: row.amount, currency: row.currency, vendor_name: fields.get("vendor_name") ?? null, expense_category: row.category, files: row.files }
  })
  return { incomeRows, expenseRows }
}

async function contractSummaryResult(userId: string, filters: ReportFilters, source: "document_fields" | "records") {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds(["contract", "agreement"])
  if (fileIds.length === 0) return { contracts: [], obligations: {} }
  let contractRows: any[]
  if (source === "document_fields") {
    const { data, error } = await supabaseAdmin.from("document_fields")
      .select("file_id, counterparty_name, document_date, period_start, period_end, invoice_number, total_amount, currency, payment_method, confidence_score, files!inner(filename, document_type)")
      .in("file_id", fileIds).neq("normalization_status", "excluded").order("document_date", { ascending: false })
    if (error) throw new Error(error.message)
    contractRows = (data ?? []).filter((row) => overlapsDateRange(row, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" }))
  } else {
    let query = supabaseAdmin.from("records").select("id, file_id, document_type, occurred_on, period_start, period_end, amount, currency, confidence, files!inner(filename, document_type)").in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: false })
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const records = data ?? []
    const { data: attributes, error: attributesError } = records.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", records.map((row) => row.id)).in("field_key", ["counterparty_name", "invoice_number", "payment_method"])
    if (attributesError) throw new Error(attributesError.message)
    const byRecord = new Map<string, Map<string, unknown>>()
    for (const attribute of attributes ?? []) byRecord.set(attribute.record_id, new Map([...(byRecord.get(attribute.record_id) ?? []), [attribute.field_key, attribute.value]]))
    contractRows = records.filter((row) => overlapsDateRange({ document_date: row.occurred_on, period_start: row.period_start, period_end: row.period_end }, { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" })).map((row) => {
      const fields = byRecord.get(row.id) ?? new Map<string, unknown>()
      return { file_id: row.file_id, counterparty_name: fields.get("counterparty_name") ?? null, document_date: row.occurred_on, period_start: row.period_start, period_end: row.period_end, invoice_number: fields.get("invoice_number") ?? null, total_amount: row.amount, currency: row.currency, payment_method: fields.get("payment_method") ?? null, confidence_score: row.confidence, files: row.files }
    })
  }
  const visibleFileIds = contractRows.map((row) => row.file_id)
  if (visibleFileIds.length === 0) return { contracts: [], obligations: {} }
  const { data: obligs, error: obligError } = await supabaseAdmin.from("payment_obligations").select("*").in("file_id", visibleFileIds).order("due_date", { ascending: true })
  if (obligError) throw new Error(obligError.message)
  const obligations: Record<string, unknown[]> = {}
  for (const row of obligs ?? []) (obligations[row.file_id] ??= []).push(row)
  return { contracts: contractRows, obligations }
}

async function legacyRowsWithIdentity(userId: string, filters: ReportFilters, reportRows: TaxRow[]): Promise<IdentifiedRow[]> {
  const context = await createReportQueryContext(userId, filters)
  const fileIds = await context.fileIds()
  if (filters.targetFolder && fileIds.length === 0) return []

  let query = supabaseAdmin
    .from("document_fields")
    .select("file_id, source_key, document_date, period_start, period_end, files!inner(user_id)")
    .eq("files.user_id", userId)
    .neq("normalization_status", "excluded")
    .order("document_date", { ascending: false })
  if (fileIds.length > 0) query = query.in("file_id", fileIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const candidates = (data ?? []).filter((row) => overlapsDateRange(row, {
    dateFrom: filters.dateFrom ?? "",
    dateTo: filters.dateTo ?? "",
  }))
  const byFile = new Map<string, typeof candidates>()
  for (const candidate of candidates) byFile.set(candidate.file_id, [...(byFile.get(candidate.file_id) ?? []), candidate])

  return reportRows.map((row) => {
    const matches = byFile.get(row.file_id) ?? []
    const candidate = matches.shift()
    return candidate
      ? { identity: { file_id: candidate.file_id, source_key: candidate.source_key }, occurredOn: candidate.document_date, row }
      : { identity: { file_id: row.file_id, source_key: "<unmatched-legacy>" }, occurredOn: row.document_date, row }
  })
}

function identityKey(identity: Identity): string {
  return `${identity.file_id}\u0000${identity.source_key}`
}

function sortIdentified(rows: IdentifiedRow[]): IdentifiedRow[] {
  return [...rows].sort((left, right) => {
    const dateOrder = (right.occurredOn ?? "").localeCompare(left.occurredOn ?? "")
    if (dateOrder !== 0) return dateOrder
    const sourceOrder = left.identity.source_key.localeCompare(right.identity.source_key)
    if (sourceOrder !== 0) return sourceOrder
    return left.identity.file_id.localeCompare(right.identity.file_id)
  })
}

function reportFromRows(rows: TaxRow[], report: ReportKey) {
  if (report === "business-expense") return { expenses: rows.filter((row) => isExpenseRow(row) && isUsdRow(row)) }
  const detectedYears = Array.from(new Set(rows.flatMap((row) => [row.period_end, row.period_start, row.document_date]
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value.slice(0, 4)))
    .filter((value) => Number.isFinite(value))))).sort((a, b) => b - a)
  return {
    rows,
    totalOwnedDocs: rows.length,
    detectedYears,
    defaultYear: selectTaxBundleDefaultYear(detectedYears, rows),
    summary: computeTaxBundle(rows),
  }
}

function reportFromExpenseRows(rows: unknown[]) {
  return { expenses: rows }
}

function comparable(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries(Array.from(value.entries()).map(([key, entry]) => [String(key), comparable(entry)]))
  if (Array.isArray(value)) return value.map(comparable)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, comparable(entry)]))
  }
  return value
}

function withoutRawJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRawJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as JsonObject)
      .filter(([key]) => key !== "raw_json")
      .map(([key, entry]) => [key, withoutRawJson(entry)]))
  }
  return value
}

function diff(left: unknown, right: unknown, path = "", differences: string[] = []): string[] {
  if (Object.is(left, right)) return differences
  if (typeof left !== typeof right || left === null || right === null) {
    differences.push(`${path || "<root>"}: ${format(left)} vs ${format(right)}`)
    return differences
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index += 1) diff(left[index], right[index], `${path}[${index}]`, differences)
    return differences
  }
  if (typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left as JsonObject), ...Object.keys(right as JsonObject)].sort())
    for (const key of keys) diff((left as JsonObject)[key], (right as JsonObject)[key], path ? `${path}.${key}` : key, differences)
    return differences
  }
  differences.push(`${path || "<root>"}: ${format(left)} vs ${format(right)}`)
  return differences
}

function format(value: unknown): string {
  if (value === undefined) return "<missing>"
  return typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value)
}

async function main() {
  const userId = await resolveUserId(userInput)
  const filters = { dateFrom, dateTo, targetFolder }
  if (reportKey === "expense-summary") {
    const legacy = reportFromExpenseRows(await expenseSummaryRows(userId, filters, "document_fields"))
    const records = reportFromExpenseRows(await expenseSummaryRows(userId, filters, "records"))
    const differences = diff(comparable(legacy), comparable(records))
    console.log(JSON.stringify({ userId, report: reportKey, filters, legacy: summarize(legacy), records: summarize(records), matchedCount: Math.min(legacy.expenses.length, records.expenses.length), unmatchedLegacy: [], unmatchedRecords: [], differences }, null, 2))
    if (differences.length > 0) process.exitCode = 1
    return
  }
  if (reportKey === "income-summary") {
    const legacy = { income: await incomeSummaryRows(userId, filters, "document_fields") }
    const records = { income: await incomeSummaryRows(userId, filters, "records") }
    const differences = diff(comparable(legacy), comparable(records))
    console.log(JSON.stringify({ userId, report: reportKey, filters, legacy: { rowCount: legacy.income.length, result: legacy }, records: { rowCount: records.income.length, result: records }, matchedCount: Math.min(legacy.income.length, records.income.length), unmatchedLegacy: [], unmatchedRecords: [], differences }, null, 2))
    if (differences.length > 0) process.exitCode = 1
    return
  }
  if (reportKey === "profit-loss") {
    const legacy = await profitLossRows(userId, filters, "document_fields")
    const records = await profitLossRows(userId, filters, "records")
    const differences = diff(comparable(legacy), comparable(records))
    console.log(JSON.stringify({ userId, report: reportKey, filters, legacy: { incomeCount: legacy.incomeRows.length, expenseCount: legacy.expenseRows.length, result: legacy }, records: { incomeCount: records.incomeRows.length, expenseCount: records.expenseRows.length, result: records }, matchedCount: Math.min(legacy.incomeRows.length, records.incomeRows.length) + Math.min(legacy.expenseRows.length, records.expenseRows.length), unmatchedLegacy: [], unmatchedRecords: [], differences }, null, 2))
    if (differences.length > 0) process.exitCode = 1
    return
  }
  if (reportKey === "contract-summary") {
    const legacy = await contractSummaryResult(userId, filters, "document_fields")
    const records = await contractSummaryResult(userId, filters, "records")
    const differences = diff(comparable(legacy), comparable(records))
    console.log(JSON.stringify({ userId, report: reportKey, filters, legacy: { rowCount: legacy.contracts.length, result: legacy }, records: { rowCount: records.contracts.length, result: records }, matchedCount: Math.min(legacy.contracts.length, records.contracts.length), unmatchedLegacy: [], unmatchedRecords: [], differences }, null, 2))
    if (differences.length > 0) process.exitCode = 1
    return
  }
  const legacyRows = await legacyReportRows(userId, filters)
  const legacy = sortIdentified(await legacyRowsWithIdentity(userId, filters, legacyRows))
  const records = sortIdentified(await recordsRows(userId, filters))
  const legacyByKey = new Map(legacy.map((entry) => [identityKey(entry.identity), entry]))
  const recordsByKey = new Map(records.map((entry) => [identityKey(entry.identity), entry]))
  const matchedKeys = Array.from(legacyByKey.keys()).filter((key) => recordsByKey.has(key)).sort()
  const unmatchedLegacy = Array.from(legacyByKey.values()).filter((entry) => !recordsByKey.has(identityKey(entry.identity))).map((entry) => entry.identity)
  const unmatchedRecords = Array.from(recordsByKey.values()).filter((entry) => !legacyByKey.has(identityKey(entry.identity))).map((entry) => entry.identity)
  const matchedLegacyEntries = sortIdentified(matchedKeys.map((key) => legacyByKey.get(key)!))
  const matchedRecordEntries = sortIdentified(matchedKeys.map((key) => recordsByKey.get(key)!))
  const matchedLegacyRows = matchedLegacyEntries.map((entry) => entry.row)
  const matchedRecordRows = matchedRecordEntries.map((entry) => entry.row)
  const legacyReport = reportFromRows(matchedLegacyRows, reportKey)
  const recordsReport = reportFromRows(matchedRecordRows, reportKey)
  // raw_json is selected for the internal classification fallback, but no
  // app, MCP, or firm-export consumer reads it from the report response. It
  // carries raw model/provider internals and is a separate deliberate shape
  // removal; exclude it from parity while preserving computation behavior.
  const differences = diff(comparable(withoutRawJson(legacyReport)), comparable(withoutRawJson(recordsReport)))
  const recordEntriesByKey = new Map(matchedRecordEntries.map((entry) => [identityKey(entry.identity), entry]))
  const phpContributions = matchedLegacyEntries
    .map((legacyEntry) => {
      const recordsEntry = recordEntriesByKey.get(identityKey(legacyEntry.identity))!
      const legacyAmount = legacyEntry.row.currency === "PHP" ? getTaxRowAmount(legacyEntry.row) : 0
      const recordsAmount = recordsEntry.row.currency === "PHP" ? getTaxRowAmount(recordsEntry.row) : 0
      return { ...legacyEntry.identity, legacy: legacyAmount, records: recordsAmount, difference: recordsAmount - legacyAmount }
    })
    .filter((entry) => entry.legacy !== 0 || entry.records !== 0)

  console.log(JSON.stringify({
    userId,
    report: reportKey,
    filters,
    legacy: summarize(legacyReport),
    records: summarize(recordsReport),
    matchedCount: matchedKeys.length,
    unmatchedLegacy,
    unmatchedRecords,
    phpContributions,
    differences,
  }, null, 2))
  if (differences.length > 0 || unmatchedLegacy.length > 0 || unmatchedRecords.length > 0) process.exitCode = 1
}

function summarize(result: unknown) {
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown[] }).rows
    return { rowCount: rows.length, result }
  }
  if (result && typeof result === "object" && "expenses" in result) {
    const expenses = (result as { expenses: unknown[] }).expenses
    return { expenseCount: expenses.length, result }
  }
  return { result }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 2
})
