import {
  ATTRIBUTE_FIELDS,
  CHILD_FIELD,
  RECORD_COLUMN_BY_EXTRACTED,
  deriveDirection,
} from "./field-mapping.ts"

export type ExtractionInput = Record<string, unknown> | readonly Record<string, unknown>[]

export type DerivedRecord = {
  file_id: string
  user_id: string
  source_key: string
  parent_record_id: null
  parent_source_key?: string
  record_type: string
  occurred_on: unknown
  amount: unknown
  currency: unknown
  direction: "inflow" | "outflow" | "neutral"
  counterparty: unknown
  counterparty_normalized: unknown
  category: unknown
  period_start: unknown
  period_end: unknown
  is_recurring: unknown
  confidence: number | null
  field_confidence: Record<string, number>
  needs_review: boolean
}

export type DerivedAttribute = {
  file_id: string
  user_id: string
  source_key: string
  field_key: string
  value: unknown
  value_type: "string" | "number" | "boolean" | "date" | "array" | "object" | "null"
  confidence: number | null
}

export type DeriveResult = {
  records: DerivedRecord[]
  attributes: DerivedAttribute[]
  reason?: string
}

type FileInput = { id: string; user_id: string }

const META_FIELDS = new Set(["document_type", "confidence", "confidence_score", "field_confidence", "_field_confidence", "line_items"])
const FINANCIAL_TYPES = new Set([
  "receipt", "invoice", "payslip", "income_statement", "bank_statement", "transaction_record", "tax_document",
])

export type DeriveOptions = {
  sourceKey?: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function valueType(key: string, value: unknown): DerivedAttribute["value_type"] {
  if (value === null || value === undefined) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  if (typeof value === "object") return "object"
  if (/date|period_start|period_end|occurred_on/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return "date"
  return "string"
}

function confidenceMap(row: Record<string, unknown>): Record<string, number> {
  const candidate = row.field_confidence ?? row._field_confidence
  if (!isObject(candidate)) return {}
  return Object.fromEntries(Object.entries(candidate).filter(([, value]) => typeof value === "number")) as Record<string, number>
}

function rowConfidence(row: Record<string, unknown>, field: string, map: Record<string, number>): number | null {
  const value = map[field] ?? row.confidence ?? row.confidence_score
  return typeof value === "number" ? value : null
}

function containsNumericValue(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value)) return value.some(containsNumericValue)
  if (isObject(value)) return Object.values(value).some(containsNumericValue)
  return false
}

function hasNumericExtractionValue(row: Record<string, unknown>): boolean {
  return Object.entries(row)
    .filter(([key]) => !META_FIELDS.has(key))
    .some(([, value]) => containsNumericValue(value))
}

function numericAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string" || value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function firstNonNull(...values: unknown[]): unknown {
  return values.find((value) => value !== null && value !== undefined) ?? null
}

function counterpartyFor(row: Record<string, unknown>): unknown {
  return firstNonNull(row.vendor_name, row.employer_name)
}

function isParentRestatement(item: Record<string, unknown>, parentAmount: unknown): boolean {
  const parentValue = numericAmount(parentAmount)
  const itemValue = numericAmount(item.amount)
  return parentValue !== null && itemValue !== null && Math.abs(parentValue - itemValue) <= 0.005
}

function normaliseRows(extraction: unknown): { rows: Record<string, unknown>[]; reason?: string } {
  if (Array.isArray(extraction)) {
    if (!extraction.every(isObject)) return { rows: [], reason: "Extraction rows must all be objects" }
    return { rows: [...extraction] }
  }
  if (!isObject(extraction)) return { rows: [], reason: "Extraction payload must be an object or array" }
  if (Object.keys(extraction).length === 0) return { rows: [] }
  if ("rows" in extraction || "records" in extraction) {
    const candidate = extraction.rows ?? extraction.records
    if (!Array.isArray(candidate) || !candidate.every(isObject)) return { rows: [], reason: "Extraction rows must be an array of objects" }
    return { rows: [...candidate] }
  }
  return { rows: [extraction] }
}

function recordType(row: Record<string, unknown>, fallback?: unknown): string {
  return typeof row.document_type === "string" && row.document_type.trim()
    ? row.document_type
    : typeof fallback === "string" && fallback.trim() ? fallback : "general_document"
}

function amountFor(row: Record<string, unknown>, type: string): unknown {
  if (type === "payslip" && row.net_income !== undefined) return row.net_income
  return row.total_amount ?? null
}

function makeRecord(
  row: Record<string, unknown>,
  file: FileInput,
  sourceKey: string,
  parentSourceKey?: string,
  forcedType?: string,
  fallbackType?: string,
  inherited?: { document_date?: unknown; currency?: unknown },
): DerivedRecord {
  const type = forcedType ?? recordType(row, fallbackType)
  const fieldConfidence = confidenceMap(row)
  const contributing = Object.keys(row).filter((key) => !META_FIELDS.has(key) && row[key] !== null && row[key] !== undefined)
  const confidenceValues = contributing.map((key) => rowConfidence(row, key, fieldConfidence)).filter((value): value is number => value !== null)
  const confidence = confidenceValues.length ? Math.min(...confidenceValues) : null
  const amount = forcedType === "line_item" ? row.amount ?? null : amountFor(row, type)
  const occurredOn = forcedType === "line_item"
    ? row.due_date ?? inherited?.document_date ?? null
    : row.document_date ?? null
  const currency = row.currency ?? inherited?.currency ?? null
  const needsReview = confidenceValues.some((value) => value < 0.8)
    || (occurredOn === null && !hasNumericExtractionValue(row))
    || (FINANCIAL_TYPES.has(type) && (amount === null || occurredOn === null))
    || (amount !== null && currency == null)

  const record: DerivedRecord = {
    file_id: file.id,
    user_id: file.user_id,
    source_key: sourceKey,
    parent_record_id: null,
    ...(parentSourceKey ? { parent_source_key: parentSourceKey } : {}),
    record_type: type,
    occurred_on: occurredOn,
    amount,
    currency,
    direction: deriveDirection(row, type === "line_item" ? (fallbackType ?? recordType(row)) : type),
    counterparty: counterpartyFor(row),
    counterparty_normalized: row.vendor_normalized ?? null,
    category: row.expense_category ?? null,
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    is_recurring: row.is_recurring ?? null,
    confidence,
    field_confidence: Object.fromEntries(
      Object.entries(RECORD_COLUMN_BY_EXTRACTED)
        .filter(([key]) => fieldConfidence[key] !== undefined)
        .map(([key, column]) => [column, fieldConfidence[key]]),
    ),
    needs_review: needsReview,
  }
  return record
}

function attributesFor(row: Record<string, unknown>, file: FileInput, sourceKey: string, type: string): DerivedAttribute[] {
  const fieldConfidence = confidenceMap(row)
  const counterparty = counterpartyFor(row)
  return Object.entries(row)
    .filter(([key, value]) => !META_FIELDS.has(key) && value !== null && value !== undefined)
    .filter(([key, value]) => ATTRIBUTE_FIELDS.has(key)
      || RECORD_COLUMN_BY_EXTRACTED[key] === undefined
      || ((key === "net_income" || key === "employer_name") && type !== "payslip")
      || ((key === "vendor_name" || key === "employer_name") && value === counterpartyFor(row) && value !== counterparty))
    .filter(([key, value]) => !(key === "employer_name" && type === "payslip" && value === counterparty))
    .map(([key, value]) => ({
      file_id: file.id,
      user_id: file.user_id,
      source_key: sourceKey,
      field_key: key,
      value,
      value_type: valueType(key, value),
      confidence: rowConfidence(row, key, fieldConfidence),
    }))
}

export function deriveRecords(extraction: unknown, file: FileInput, options: DeriveOptions = {}): DeriveResult {
  if (!file?.id || !file?.user_id) return { records: [], attributes: [], reason: "File id and user id are required" }
  const normalised = normaliseRows(extraction)
  if (normalised.reason) return { records: [], attributes: [], reason: normalised.reason }

  const records: DerivedRecord[] = []
  const attributes: DerivedAttribute[] = []
  const fallbackType = isObject(extraction) && typeof extraction.document_type === "string" ? extraction.document_type : undefined
  const rows = normalised.rows
  rows.forEach((row, rowIndex) => {
    const sourceKey = options.sourceKey ?? (rows.length === 1 && !Array.isArray(extraction) && !("rows" in (extraction as object)) && !("records" in (extraction as object)) ? "root" : String(rowIndex))
    const type = recordType(row, fallbackType)
    const parentRecord = makeRecord(row, file, sourceKey, undefined, undefined, fallbackType)
    records.push(parentRecord)
    attributes.push(...attributesFor(row, file, sourceKey, type))
    const items = row[CHILD_FIELD]
    if (items === undefined || items === null) return
    if (!Array.isArray(items)) return
    if (items.length === 1 && isObject(items[0]) && isParentRestatement(items[0], parentRecord.amount)) {
      attributes.push(...attributesFor(items[0], file, sourceKey, type))
      return
    }
    items.forEach((item, itemIndex) => {
      if (!isObject(item)) return
      const childKey = `${sourceKey}.${itemIndex + 1}`
      records.push(makeRecord(item, file, childKey, sourceKey, "line_item", type, {
        document_date: row.document_date,
        currency: row.currency,
      }))
      attributes.push(...attributesFor(item, file, childKey, "line_item"))
    })
  })
  return { records, attributes }
}
