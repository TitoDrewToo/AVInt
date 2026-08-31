export type DatasetDataType = "number" | "date" | "text" | "boolean"

export type DatasetColumn = {
  key: string
  label: string
  position: number
  data_type: DatasetDataType
  role: null
  null_count: number
  distinct_count: number
  type_confidence: number | null
  sample_values: unknown[]
  needs_review: boolean
  review_reason: string | null
}

export type DatasetSheet = {
  name: string
  sheet_name: string
  row_count: number
  column_count: number
  needs_review: boolean
  columns: DatasetColumn[]
  rows: Array<{ row_index: number; data: Record<string, unknown>; data_raw: Record<string, unknown> }>
}

type DateOrder = "DMY" | "MDY" | null

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "")
}

function rawText(value: unknown): string | null {
  if (isBlank(value)) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  return String(value)
}

function jsonValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  return value
}

function normaliseKey(label: string, position: number, used: Map<string, number>): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `column_${position}`
  const count = (used.get(base) ?? 0) + 1
  used.set(base, count)
  return count === 1 ? base : `${base}_${count}`
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  const text = rawText(value)
  if (text === null) return null
  const trimmed = text.trim()
  const parenthesised = trimmed.startsWith("(") && trimmed.endsWith(")")
  const body = parenthesised ? trimmed.slice(1, -1).trim() : trimmed
  const withoutCurrency = body.replace(/^[\$£€₱]\s*/, "")
  if (!/^[+-]?(?:(?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.\d+)?$/.test(withoutCurrency)) return null
  const parsed = Number(withoutCurrency.replace(/,/g, ""))
  if (!Number.isFinite(parsed)) return null
  return parenthesised ? -parsed : parsed
}

function parseBoolean(value: unknown): boolean | null {
  const text = rawText(value)?.toLowerCase()
  if (text === "true" || text === "yes" || text === "y") return true
  if (text === "false" || text === "no" || text === "n") return false
  return null
}

function slashParts(value: unknown): { first: number; second: number; year: number; separator: string } | null {
  const text = rawText(value)
  const match = text?.match(/^(\d{1,2})([/.])(\d{1,2})\2(\d{4})$/)
  if (!match) return null
  return { first: Number(match[1]), second: Number(match[3]), year: Number(match[4]), separator: match[2] }
}

function inferDateOrder(values: unknown[]): DateOrder | "ambiguous" {
  let order: DateOrder = null
  for (const value of values) {
    const parts = slashParts(value)
    if (!parts) continue
    const proven = parts.first > 12 ? "DMY" : parts.second > 12 ? "MDY" : null
    if (!proven) continue
    if (order && order !== proven) return "ambiguous"
    order = proven
  }
  return order ?? "ambiguous"
}

function parseDate(value: unknown, order: DateOrder): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  const text = rawText(value)
  if (text === null) return null
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const date = new Date(`${text}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : null
  }
  const parts = slashParts(text)
  if (!parts || !order) return null
  const month = order === "MDY" ? parts.first : parts.second
  const day = order === "MDY" ? parts.second : parts.first
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(parts.year, month - 1, day))
  return date.getUTCFullYear() === parts.year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null
}

function distinctKey(value: unknown): string {
  return JSON.stringify(jsonValue(value))
}

function inferColumn(label: string, position: number, values: unknown[], key: string): DatasetColumn {
  const nonNull = values.filter((value) => !isBlank(value))
  const nullCount = values.length - nonNull.length
  const distinct = new Map<string, unknown>()
  for (const value of nonNull) distinct.set(distinctKey(value), jsonValue(value))

  const numericValues = nonNull.map(parseNumber)
  const numericCount = numericValues.filter((value): value is number => value !== null).length
  if (nonNull.length > 0 && numericCount / nonNull.length >= 0.95) {
    return {
      key, label, position, data_type: "number", role: null, null_count: nullCount,
      distinct_count: distinct.size, type_confidence: numericCount / nonNull.length,
      sample_values: [...distinct.values()].slice(0, 5), needs_review: false, review_reason: null,
    }
  }

  const booleanValues = nonNull.map(parseBoolean)
  const booleanCount = booleanValues.filter((value): value is boolean => value !== null).length
  if (nonNull.length > 0 && booleanCount === nonNull.length) {
    return {
      key, label, position, data_type: "boolean", role: null, null_count: nullCount,
      distinct_count: distinct.size, type_confidence: 1, sample_values: [...distinct.values()].slice(0, 5),
      needs_review: false, review_reason: null,
    }
  }

  const dateOrder = inferDateOrder(nonNull)
  const dateValues = nonNull.map((value) => parseDate(value, dateOrder === "ambiguous" ? null : dateOrder))
  const dateCount = dateValues.filter((value): value is string => value !== null).length
  const hasSlashDates = nonNull.some((value) => slashParts(value) !== null)
  if ((!hasSlashDates || dateOrder !== "ambiguous") && nonNull.length > 0 && dateCount / nonNull.length >= 0.95) {
    return {
      key, label, position, data_type: "date", role: null, null_count: nullCount,
      distinct_count: distinct.size, type_confidence: dateCount / nonNull.length,
      sample_values: [...distinct.values()].slice(0, 5), needs_review: false, review_reason: null,
    }
  }

  const ambiguousDates = nonNull.some((value) => slashParts(value) !== null) && dateOrder === "ambiguous"
  return {
    key, label, position, data_type: "text", role: null, null_count: nullCount,
    distinct_count: distinct.size, type_confidence: nonNull.length === 0 ? null : 1,
    sample_values: [...distinct.values()].slice(0, 5), needs_review: ambiguousDates,
    review_reason: ambiguousDates
      ? `Date order is ambiguous (${rawText(nonNull.find((value) => slashParts(value) !== null))} could be 3 Apr or 4 Mar). No value in this column proves the order.`
      : null,
  }
}

function coerce(value: unknown, column: DatasetColumn, dateOrder: DateOrder | "ambiguous"): unknown {
  if (isBlank(value)) return null
  if (column.data_type === "number") return parseNumber(value)
  if (column.data_type === "boolean") return parseBoolean(value)
  if (column.data_type === "date") return parseDate(value, dateOrder === "ambiguous" ? null : dateOrder)
  return rawText(value)
}

export function buildDatasetSheet(sheetName: string, rawHeaders: unknown[], rawRows: unknown[][]): DatasetSheet {
  const usedKeys = new Map<string, number>()
  const headers = rawHeaders.map((header, position) => {
    const label = rawText(header) ?? ""
    return { label, position, key: normaliseKey(label, position, usedKeys) }
  })
  const valuesByPosition = headers.map((header) => rawRows.map((row) => row[header.position] ?? null))
  const columns = headers.map((header, position) => inferColumn(header.label, header.position, valuesByPosition[position], header.key))
  const rows = rawRows.map((row, rowIndex) => ({
    row_index: rowIndex,
    data: Object.fromEntries(headers.map((header, position) => [header.key, coerce(row[position] ?? null, columns[position], inferDateOrder(valuesByPosition[position]))])),
    data_raw: Object.fromEntries(headers.map((header, position) => [header.key, rawText(row[position] ?? null)])),
  }))
  return {
    name: sheetName,
    sheet_name: sheetName,
    row_count: rows.length,
    column_count: columns.length,
    needs_review: columns.some((column) => column.needs_review),
    columns,
    rows,
  }
}

type QueryClient = { from: (table: string) => any }

function assertNoError(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation} failed: ${error.message ?? String(error)}`)
}

export async function replaceSpreadsheetDatasets(client: QueryClient, fileId: string, userId: string, sheets: DatasetSheet[]) {
  const { error: deleteError } = await client.from("datasets").delete().eq("file_id", fileId)
  assertNoError(deleteError, "existing datasets delete")
  for (const sheet of sheets) {
    const { data: dataset, error: datasetError } = await client
      .from("datasets")
      .insert({ user_id: userId, file_id: fileId, name: sheet.name, sheet_name: sheet.sheet_name, row_count: sheet.row_count, column_count: sheet.column_count, needs_review: sheet.needs_review })
      .select("id")
      .single()
    assertNoError(datasetError, "dataset insert")
    if (!dataset?.id) throw new Error("dataset insert returned no id")

    if (sheet.columns.length > 0) {
      const { error } = await client.from("dataset_columns").insert(sheet.columns.map((column) => ({ dataset_id: dataset.id, user_id: userId, ...column })))
      assertNoError(error, "dataset columns insert")
    }
    if (sheet.rows.length > 0) {
      const { error } = await client.from("dataset_rows").insert(sheet.rows.map((row) => ({ dataset_id: dataset.id, user_id: userId, ...row })))
      assertNoError(error, "dataset rows insert")
    }
  }
}
