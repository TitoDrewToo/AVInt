export const INCOME_DOCUMENT_TYPES = new Set(["payslip", "income_statement"])
export const EXPENSE_DOCUMENT_TYPES = new Set(["receipt", "invoice", "transaction_record"])

type FileLike = { document_type?: unknown } | null | undefined

export type ClassifiableDocumentRow = {
  document_type?: unknown
  raw_json?: unknown
  files?: FileLike | FileLike[]
  gross_income?: number | null
  net_income?: number | null
  total_amount?: number | null
  currency?: string | null
  vendor_name?: string | null
  expense_category?: string | null
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  return trimmed || null
}

export function rowDocumentType(row: ClassifiableDocumentRow): string | null {
  const raw = row.raw_json
  const rawObject = raw && typeof raw === "object" ? raw as { gemini_document_type?: unknown; gemini_raw?: unknown } : null
  const rawType = rawObject?.gemini_raw
  const contentType = rawType && typeof rawType === "object" && "document_type" in rawType
    ? (rawType as { document_type?: unknown }).document_type
    : null
  return stringValue(row.document_type) ?? stringValue(rawObject?.gemini_document_type) ?? stringValue(contentType)
}

function rowFileDocumentType(row: ClassifiableDocumentRow): string | null {
  const file = Array.isArray(row.files) ? row.files[0] : row.files
  return stringValue(file?.document_type) ?? stringValue(row.document_type)
}

function rawGeminiRow(row: ClassifiableDocumentRow): Record<string, unknown> | null {
  const raw = row.raw_json
  if (!raw || typeof raw !== "object" || !("gemini_raw" in raw)) return null
  const geminiRaw = (raw as { gemini_raw?: unknown }).gemini_raw
  return geminiRaw && typeof geminiRaw === "object" ? geminiRaw as Record<string, unknown> : null
}

function rowLabelText(row: ClassifiableDocumentRow): string {
  const raw = rawGeminiRow(row)
  return [
    row.vendor_name,
    raw?.vendor_name,
    raw?.employer_name,
    raw?.counterparty_name,
    raw?.supplier,
    raw?.description,
    raw?.raw_description,
  ].filter((value): value is string => typeof value === "string").join(" ").trim()
}

export function isAggregateRow(row: ClassifiableDocumentRow): boolean {
  return /^(?:sub\s*-?total|grand\s+total|total)(?:\s|$)/i.test(rowLabelText(row))
}

export function isCreditOrRefundRow(row: ClassifiableDocumentRow): boolean {
  return /^(?:refund|credit|rebate|chargeback|return)(?:\s|$)/i.test(rowLabelText(row))
}

export function classifyRow(row: ClassifiableDocumentRow): "income" | "expense" | null {
  if (isAggregateRow(row)) return null
  if (isCreditOrRefundRow(row)) return "income"

  const contentType = rowDocumentType(row)
  const fileType = rowFileDocumentType(row)

  if (INCOME_DOCUMENT_TYPES.has(contentType ?? "")) return "income"
  if (EXPENSE_DOCUMENT_TYPES.has(contentType ?? "")) return "expense"
  if (INCOME_DOCUMENT_TYPES.has(fileType ?? "")) return "income"
  if (EXPENSE_DOCUMENT_TYPES.has(fileType ?? "")) return "expense"

  if (fileType === "csv_export") {
    if (row.gross_income != null || row.net_income != null) return "income"
    if (row.total_amount != null) return "expense"
  }

  return null
}

export function isExpenseRow(row: ClassifiableDocumentRow): boolean {
  return classifyRow(row) === "expense"
}

export function isExportableExpenseRow(row: ClassifiableDocumentRow): boolean {
  return isExpenseRow(row) && typeof row.expense_category === "string" && row.expense_category.trim().length > 0
}

export function currencyLabel(currency: string | null | undefined): string {
  const normalized = typeof currency === "string" ? currency.trim().toUpperCase() : ""
  return normalized || "UNSPECIFIED"
}

export function isUsdRow(row: Pick<ClassifiableDocumentRow, "currency">): boolean {
  return currencyLabel(row.currency) === "USD"
}
