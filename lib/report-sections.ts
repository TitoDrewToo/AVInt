import { createClient } from "@supabase/supabase-js"
import { overlapsDateRange } from "@/lib/report-utils"
import { classifyRow } from "@/lib/document-classification"
import type { ReportFilters } from "@/lib/report-engine"
import type { ReportQueryContext } from "@/lib/report-query-context-server"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type ReportSectionResult =
  | { expenses: unknown[] }
  | { income: unknown[] }
  | { incomeRows: unknown[]; expenseRows: unknown[] }
  | { contracts: unknown[]; obligations: Record<string, unknown[]> }
  | { docs: unknown[] }

type Filters = Pick<ReportFilters, "dateFrom" | "dateTo" | "targetFolder">
type Context = Pick<ReportQueryContext, "fileIds">

function bounds(filters: Filters) {
  return { dateFrom: filters.dateFrom ?? "", dateTo: filters.dateTo ?? "" }
}

export async function getExpenseSummary(userId: string, _context: Context, filters: Filters): Promise<{ expenses: unknown[] }> {
  const fileIds = await _context.fileIds(["receipt", "invoice"])
  if (fileIds.length === 0) return { expenses: [] }
  let query = supabaseAdmin.from("records").select("id, file_id, document_type, occurred_on, amount, currency, category, confidence, files!inner(filename, document_type)").in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: false })
  if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom)
  if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = data ?? []
  const { data: attributes, error: attributesError } = records.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, value").in("record_id", records.map((row) => row.id)).eq("field_key", "vendor_name")
  if (attributesError) throw new Error(attributesError.message)
  const vendors = new Map((attributes ?? []).map((row) => [row.record_id, row.value]))
  return { expenses: records.map((row) => ({ file_id: row.file_id, vendor_name: vendors.get(row.id) ?? null, document_date: row.occurred_on, total_amount: row.amount, currency: row.currency, expense_category: row.category, confidence_score: row.confidence, files: row.files })) }
}

export async function getIncomeSummary(userId: string, context: Context, filters: Filters): Promise<{ income: unknown[] }> {
  const fileIds = await context.fileIds()
  let query = supabaseAdmin.from("records").select("id, file_id, document_type, occurred_on, amount, currency, direction, confidence, files!inner(filename, document_type)").is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: false })
  if (fileIds.length > 0) query = query.in("file_id", fileIds)
  if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom)
  if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const records = data ?? []
  const { data: attributes, error: attributesError } = records.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", records.map((row) => row.id)).in("field_key", ["employer_name", "gross_income", "net_income", "income_source"])
  if (attributesError) throw new Error(attributesError.message)
  const byRecord = new Map<string, Map<string, unknown>>()
  for (const attribute of attributes ?? []) { const fields = byRecord.get(attribute.record_id) ?? new Map<string, unknown>(); fields.set(attribute.field_key, attribute.value); byRecord.set(attribute.record_id, fields) }
  return { income: records.map((row) => { const fields = byRecord.get(row.id) ?? new Map<string, unknown>(); const documentType = row.document_type ?? row.files?.[0]?.document_type; return { row, fields, documentType } }).filter(({ row, fields }) => classifyRow({ document_type: row.document_type, files: row.files, direction: row.direction, income_source: fields.get("income_source"), total_amount: row.amount }) === "income").map(({ row, fields, documentType }) => ({ file_id: row.file_id, employer_name: fields.get("employer_name") ?? null, document_date: row.occurred_on, gross_income: fields.get("gross_income") ?? (documentType === "payslip" ? row.amount : null), net_income: fields.get("net_income") ?? null, total_amount: row.amount, currency: row.currency, confidence_score: row.confidence, income_source: fields.get("income_source") ?? null, files: row.files })) }
}

export async function getProfitLoss(userId: string, context: Context, filters: Filters): Promise<{ incomeRows: unknown[]; expenseRows: unknown[] }> {
  const fileIds = await context.fileIds()
  {
    let query = supabaseAdmin.from("records").select("id, file_id, document_type, occurred_on, amount, currency, direction, category, files!inner(document_type)").is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: true })
    if (fileIds.length > 0) query = query.in("file_id", fileIds)
    if (filters.dateFrom) query = query.gte("occurred_on", filters.dateFrom); if (filters.dateTo) query = query.lte("occurred_on", filters.dateTo)
    const { data, error } = await query; if (error) throw new Error(error.message); const records = data ?? []
    const { data: attributes, error: attributesError } = records.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", records.map((row) => row.id)).in("field_key", ["employer_name", "gross_income", "net_income", "income_source", "vendor_name"])
    if (attributesError) throw new Error(attributesError.message)
    const byRecord = new Map<string, Map<string, unknown>>(); for (const attribute of attributes ?? []) { const fields = byRecord.get(attribute.record_id) ?? new Map<string, unknown>(); fields.set(attribute.field_key, attribute.value); byRecord.set(attribute.record_id, fields) }
    const classified = records.map((row) => { const fields = byRecord.get(row.id) ?? new Map<string, unknown>(); const documentType = row.document_type ?? row.files?.[0]?.document_type; return { row, fields, documentType, classification: classifyRow({ document_type: row.document_type, files: row.files, direction: row.direction, income_source: fields.get("income_source"), total_amount: row.amount, expense_category: row.category }) } })
    const incomeRows = classified.filter(({ classification }) => classification === "income").map(({ row, fields, documentType }) => ({ document_date: row.occurred_on, gross_income: fields.get("gross_income") ?? (documentType === "payslip" ? row.amount : null), net_income: fields.get("net_income") ?? null, total_amount: row.amount, currency: row.currency, employer_name: fields.get("employer_name") ?? null, income_source: fields.get("income_source") ?? null, files: row.files }))
    const expenseRows = classified.filter(({ classification }) => classification === "expense").map(({ row, fields }) => ({ document_date: row.occurred_on, total_amount: row.amount, currency: row.currency, vendor_name: fields.get("vendor_name") ?? null, expense_category: row.category, files: row.files }))
    return { incomeRows, expenseRows }
  }
}

export async function getContractSummary(userId: string, context: Context, filters: Filters): Promise<{ contracts: unknown[]; obligations: Record<string, unknown[]> }> {
  const fileIds = await context.fileIds(["contract", "agreement"]); if (fileIds.length === 0) return { contracts: [], obligations: {} }
  const { data: records, error: contractErr } = await supabaseAdmin.from("records").select("id, file_id, occurred_on, period_start, period_end, amount, currency, confidence, files!inner(filename, document_type)").in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: false })
  if (contractErr) throw new Error(contractErr.message)
  const { data: attributes, error: attributesError } = (records ?? []).length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", (records ?? []).map((row) => row.id)).in("field_key", ["counterparty_name", "invoice_number", "payment_method"])
  if (attributesError) throw new Error(attributesError.message); const byRecord = new Map<string, Map<string, unknown>>(); for (const attribute of attributes ?? []) { const fields = byRecord.get(attribute.record_id) ?? new Map<string, unknown>(); fields.set(attribute.field_key, attribute.value); byRecord.set(attribute.record_id, fields) }
  const contracts = (records ?? []).map((row) => { const fields = byRecord.get(row.id) ?? new Map<string, unknown>(); return { file_id: row.file_id, counterparty_name: fields.get("counterparty_name") ?? null, document_date: row.occurred_on, period_start: row.period_start, period_end: row.period_end, invoice_number: fields.get("invoice_number") ?? null, total_amount: row.amount, currency: row.currency, payment_method: fields.get("payment_method") ?? null, confidence_score: row.confidence, files: row.files } }).filter((row) => overlapsDateRange({ document_date: row.document_date, period_start: row.period_start, period_end: row.period_end }, bounds(filters)))
  const visibleFileIds = contracts.map((row) => row.file_id); if (visibleFileIds.length === 0) return { contracts: [], obligations: {} }
  const { data: obligs, error: obligErr } = await supabaseAdmin.from("payment_obligations").select("*").in("file_id", visibleFileIds).order("due_date", { ascending: true }); if (obligErr) throw new Error(obligErr.message)
  const obligations: Record<string, unknown[]> = {}; for (const row of obligs ?? []) { if (!obligations[row.file_id]) obligations[row.file_id] = []; obligations[row.file_id].push(row) }
  return { contracts, obligations }
}

export async function getKeyTerms(userId: string, context: Context, filters: Filters): Promise<{ docs: unknown[] }> {
  const fileIds = await context.fileIds(["contract", "agreement"]); if (fileIds.length === 0) return { docs: [] }
  const { data: parents, error } = await supabaseAdmin.from("records").select("id, file_id, occurred_on, period_start, period_end, amount, currency, confidence, files!inner(filename, document_type)").in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).order("occurred_on", { ascending: false }); if (error) throw new Error(error.message)
  const parentRows = parents ?? []; const { data: children, error: childrenError } = parentRows.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("records").select("id, parent_record_id, source_key, amount").in("parent_record_id", parentRows.map((row) => row.id)).is("excluded_at", null).order("source_key", { ascending: true }); if (childrenError) throw new Error(childrenError.message)
  const allRecordIds = [...parentRows.map((row) => row.id), ...(children ?? []).map((row) => row.id)]; const { data: attributes, error: attributesError } = allRecordIds.length === 0 ? { data: [], error: null } : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value").in("record_id", allRecordIds); if (attributesError) throw new Error(attributesError.message)
  const byRecord = new Map<string, Map<string, unknown>>(); for (const attribute of attributes ?? []) { const fields = byRecord.get(attribute.record_id) ?? new Map<string, unknown>(); fields.set(attribute.field_key, attribute.value); byRecord.set(attribute.record_id, fields) }; const childrenByParent = new Map<string, typeof children>(); for (const child of children ?? []) { const rows = childrenByParent.get(child.parent_record_id) ?? []; rows.push(child); childrenByParent.set(child.parent_record_id, rows) }
  const docs = parentRows.map((row) => { const fields = byRecord.get(row.id) ?? new Map<string, unknown>(); const lineItems = (childrenByParent.get(row.id) ?? []).map((child) => ({ ...Object.fromEntries(Array.from(byRecord.get(child.id) ?? new Map<string, unknown>()).filter(([key]) => key !== "line_items")), amount: child.amount, quantity: (byRecord.get(child.id) ?? new Map<string, unknown>()).get("quantity") ?? null })); return { file_id: row.file_id, counterparty_name: fields.get("counterparty_name") ?? null, document_date: row.occurred_on, period_start: row.period_start, period_end: row.period_end, invoice_number: fields.get("invoice_number") ?? null, payment_method: fields.get("payment_method") ?? null, total_amount: row.amount, currency: row.currency, line_items: lineItems, confidence_score: row.confidence, files: row.files } }).filter((row) => overlapsDateRange({ document_date: row.document_date, period_start: row.period_start, period_end: row.period_end }, bounds(filters)))
  return { docs }
}

export async function getReportSection(report: string, userId: string, context: Context, filters: Filters): Promise<ReportSectionResult> {
  switch (report) { case "expense-summary": return getExpenseSummary(userId, context, filters); case "income-summary": return getIncomeSummary(userId, context, filters); case "profit-loss": return getProfitLoss(userId, context, filters); case "contract-summary": return getContractSummary(userId, context, filters); case "key-terms": return getKeyTerms(userId, context, filters); default: throw new Error(`Unsupported extracted report: ${report}`) }
}
