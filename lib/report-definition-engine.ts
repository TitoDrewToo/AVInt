import { supabaseAdmin } from "@/lib/mcp-auth"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import type { ReportBlock, ReportDocument } from "@/lib/report-document"
import { RECORD_DEFINITION_FIELDS, referencedDefinitionFields, type ReportDefinition, type ReportDefinitionFilter, type ReportMetric } from "@/lib/report-definitions"

const MAX_SOURCE_ROWS = 5_000
const CORE_FIELDS = new Set<string>([...RECORD_DEFINITION_FIELDS, "filename", "folder_id"])

type ValueRow = Record<string, unknown>
export type LoadedReportDefinitionSource = { rows: ValueRow[]; availableFields: Set<string>; dateField: string | null; currencyField: string | null; sourceLabel: string }

export function projectRecordDefinitionRow(row: ValueRow, attributes: ValueRow): ValueRow {
  const file = Array.isArray(row.files) ? row.files[0] : row.files
  const linkedFile = file && typeof file === "object" ? file as ValueRow : null
  return {
    ...row,
    ...attributes,
    filename: linkedFile?.filename ?? null,
    folder_id: linkedFile?.folder_id ?? null,
    document_type: row.document_type ?? linkedFile?.document_type ?? null,
  }
}

export class ReportDefinitionExecutionError extends Error {}

function rollingBounds(unit: "month" | "year", count: number, offset: number, now: Date) {
  if (unit === "month") {
    const endStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    const from = new Date(Date.UTC(endStart.getUTCFullYear(), endStart.getUTCMonth() - count + 1, 1))
    const to = new Date(Date.UTC(endStart.getUTCFullYear(), endStart.getUTCMonth() + 1, 0))
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
  }
  const endYear = now.getUTCFullYear() + offset
  return { from: `${endYear - count + 1}-01-01`, to: `${endYear}-12-31` }
}

export function resolveDefinitionPeriod(definition: ReportDefinition, now = new Date()) {
  if (definition.period.kind === "fixed") return { from: definition.period.from, to: definition.period.to }
  if (definition.period.kind === "rolling") return rollingBounds(definition.period.unit, definition.period.count, definition.period.offset ?? 0, now)
  return { from: "", to: "" }
}

async function loadRecords(userId: string, definition: ReportDefinition): Promise<LoadedReportDefinitionSource> {
  const period = resolveDefinitionPeriod(definition)
  const context = await createReportQueryContext(userId, { targetFolder: definition.scope?.folderId })
  const fileIds = await context.fileIds(definition.source.kind === "records" ? definition.source.documentTypes ?? [] : [])
  if (!fileIds.length) return { rows: [], availableFields: new Set(CORE_FIELDS), dateField: "occurred_on", currencyField: "currency", sourceLabel: "canonical records" }
  const { data, error } = await supabaseAdmin.from("records").select("*, files!inner(filename, folder_id, document_type)").eq("user_id", userId).in("file_id", fileIds).is("parent_record_id", null).is("excluded_at", null).limit(MAX_SOURCE_ROWS + 1)
  if (error) throw new Error(error.message)
  if ((data ?? []).length > MAX_SOURCE_ROWS) throw new ReportDefinitionExecutionError(`The report source exceeds ${MAX_SOURCE_ROWS} records. Narrow its folder or document type before running it.`)
  const recordRows = data ?? []
  const recordIds = recordRows.map((row) => row.id)
  const [{ data: attributes, error: attributeError }, { data: attributeCatalog, error: catalogError }] = await Promise.all([
    recordIds.length ? supabaseAdmin.from("record_attributes").select("record_id, field_key, value").eq("user_id", userId).in("record_id", recordIds) : Promise.resolve({ data: [], error: null }),
    supabaseAdmin.from("record_attributes").select("field_key").eq("user_id", userId),
  ])
  if (attributeError) throw new Error(attributeError.message)
  if (catalogError) throw new Error(catalogError.message)
  const attributesByRecord = new Map<string, Record<string, unknown>>()
  for (const attribute of attributes ?? []) {
    const values = attributesByRecord.get(attribute.record_id) ?? {}
    values[attribute.field_key] = attribute.value
    attributesByRecord.set(attribute.record_id, values)
  }
  const availableFields = new Set(CORE_FIELDS)
  for (const attribute of attributeCatalog ?? []) availableFields.add(attribute.field_key)
  let rows = recordRows.map((row) => projectRecordDefinitionRow(row, attributesByRecord.get(row.id) ?? {}))
  if (period.from || period.to) rows = rows.filter((row) => overlaps(String(row.period_start ?? row.occurred_on ?? ""), String(row.period_end ?? row.occurred_on ?? ""), period.from, period.to))
  return { rows, availableFields, dateField: "occurred_on", currencyField: "currency", sourceLabel: "canonical records" }
}

async function loadDataset(userId: string, definition: ReportDefinition): Promise<LoadedReportDefinitionSource> {
  if (definition.source.kind !== "dataset") throw new ReportDefinitionExecutionError("Dataset source expected")
  const source = definition.source
  const { data: dataset, error } = await supabaseAdmin.from("datasets").select("id, name, file_id, files!inner(folder_id)").eq("id", source.datasetId).eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!dataset) throw new ReportDefinitionExecutionError("The selected dataset does not exist or is not accessible")
  if (definition.scope?.folderId) {
    const context = await createReportQueryContext(userId, { targetFolder: definition.scope.folderId })
    const scopedIds = await context.fileIds()
    if (!scopedIds.includes(dataset.file_id)) throw new ReportDefinitionExecutionError("The selected dataset is outside the report folder scope")
  }
  const { data: columns, error: columnError } = await supabaseAdmin.from("dataset_columns").select("key, data_type").eq("dataset_id", dataset.id).eq("user_id", userId)
  if (columnError) throw new Error(columnError.message)
  const availableFields = new Set((columns ?? []).map((column) => column.key))
  const { data: rows, error: rowError } = await supabaseAdmin.from("dataset_rows").select("data").eq("dataset_id", dataset.id).eq("user_id", userId).order("row_index").limit(MAX_SOURCE_ROWS + 1)
  if (rowError) throw new Error(rowError.message)
  if ((rows ?? []).length > MAX_SOURCE_ROWS) throw new ReportDefinitionExecutionError(`The report source exceeds ${MAX_SOURCE_ROWS} dataset rows. Narrow the dataset before running this report.`)
  let values = (rows ?? []).map((row) => row.data as ValueRow)
  const period = resolveDefinitionPeriod(definition)
  if ((period.from || period.to) && !source.dateField) throw new ReportDefinitionExecutionError("A dataset report with a period requires source.dateField")
  if (source.dateField && (period.from || period.to)) values = values.filter((row) => overlaps(String(row[source.dateField!] ?? ""), String(row[source.dateField!] ?? ""), period.from, period.to))
  return { rows: values, availableFields, dateField: source.dateField ?? null, currencyField: source.currencyField ?? null, sourceLabel: `dataset ${dataset.name}` }
}

export async function loadReportDefinitionSource(userId: string, definition: ReportDefinition): Promise<LoadedReportDefinitionSource> {
  return definition.source.kind === "records" ? loadRecords(userId, definition) : loadDataset(userId, definition)
}

function overlaps(start: string, end: string, from: string, to: string) {
  if (!start && !end) return false
  const low = start || end; const high = end || start
  return (!from || high >= from) && (!to || low <= to)
}
function compare(left: unknown, filter: ReportDefinitionFilter) {
  const right = filter.value
  if (filter.operator === "eq") return left === right || String(left ?? "") === String(right ?? "")
  if (filter.operator === "neq") return !(left === right || String(left ?? "") === String(right ?? ""))
  if (filter.operator === "contains") return String(left ?? "").toLowerCase().includes(String(right ?? "").toLowerCase())
  const a = typeof left === "number" ? left : Number(left); const b = typeof right === "number" ? right : Number(right)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  if (filter.operator === "gt") return a > b
  if (filter.operator === "gte") return a >= b
  if (filter.operator === "lt") return a < b
  return a <= b
}
function numeric(values: unknown[]) { return values.map((value) => typeof value === "number" ? value : Number(value)).filter(Number.isFinite) as number[] }
function aggregate(rows: ValueRow[], metric: ReportMetric) {
  if (metric.aggregation === "count") return metric.field ? rows.filter((row) => row[metric.field!] !== null && row[metric.field!] !== undefined && row[metric.field!] !== "").length : rows.length
  const values = numeric(rows.map((row) => row[metric.field!]))
  if (!values.length) return null
  if (metric.aggregation === "sum") return values.reduce((sum, value) => sum + value, 0)
  if (metric.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length
  if (metric.aggregation === "min") return Math.min(...values)
  return Math.max(...values)
}
function currencies(rows: ValueRow[], currencyField: string | null) {
  if (!currencyField) return [null]
  return [...new Set(rows.map((row) => String(row[currencyField] ?? "UNSPECIFIED").trim().toUpperCase() || "UNSPECIFIED"))]
}
function monetary(metric: ReportMetric, source: LoadedReportDefinitionSource) { return Boolean(source.currencyField && metric.field && ["amount", "amount_base"].includes(metric.field)) || Boolean(source.currencyField && metric.field && source.sourceLabel.startsWith("dataset ")) }
function formatMetric(value: number | null, currency: string | null) { return value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}` }
function suppressed(type: ReportBlock["type"], reason: string): ReportBlock & { suppressed: true; reason: string } {
  if (type === "kpi") return { type, items: [], suppressed: true, reason }
  if (type === "share") return { type, title: "Not stated", rows: [], suppressed: true, reason }
  if (type === "table") return { type, title: "Not stated", columns: [], rows: [], suppressed: true, reason }
  if (type === "stat") return { type, title: "Not stated", value: "", suppressed: true, reason }
  if (type === "narrative") return { type, title: "Not stated", text: "", suppressed: true, reason }
  return { type: "note", text: reason, suppressed: true, reason }
}

export async function runReportDefinition(userId: string, definition: ReportDefinition, now = new Date()): Promise<ReportDocument> {
  const source = await loadReportDefinitionSource(userId, definition)
  return compileReportDefinition(definition, source, now)
}

export function compileReportDefinition(definition: ReportDefinition, source: LoadedReportDefinitionSource, now = new Date()): ReportDocument {
  const unknownFields = referencedDefinitionFields(definition).filter((field) => !source.availableFields.has(field))
  if (unknownFields.length) throw new ReportDefinitionExecutionError(`Definition references unavailable fields: ${unknownFields.join(", ")}`)
  const rows = source.rows.filter((row) => definition.filters.every((filter) => compare(row[filter.field], filter)))
  const period = resolveDefinitionPeriod(definition, now)
  const dates = source.dateField ? rows.map((row) => String(row[source.dateField!] ?? "")).filter(Boolean).sort() : []
  const displayPeriod = { from: period.from || dates[0] || "All dates", to: period.to || dates.at(-1) || "All dates" }
  const noRows = `No rows matched this definition for ${displayPeriod.from} through ${displayPeriod.to}; this block is not stated as zero.`
  const blocks: ReportDocument["blocks"] = []
  for (const block of definition.blocks) {
    if (block.type === "note" || block.type === "narrative") { blocks.push(block); continue }
    if (!rows.length) { blocks.push(suppressed(block.type, noRows)); continue }
    if (block.type === "table") {
      const sorted = [...rows]
      if (block.sort) sorted.sort((a, b) => String(a[block.sort!.field] ?? "").localeCompare(String(b[block.sort!.field] ?? "")) * (block.sort!.direction === "asc" ? 1 : -1))
      blocks.push({ type: "table", title: block.title, columns: block.columns.map((column) => column.label ?? column.field.replaceAll("_", " ")), rows: sorted.slice(0, block.limit ?? 100).map((row) => block.columns.map((column) => scalar(row[column.field]))) })
      continue
    }
    if (block.type === "share") {
      const buckets = new Map<string, ValueRow[]>()
      for (const row of rows) {
        const currency = monetary(block.metric, source) ? String(row[source.currencyField!] ?? "UNSPECIFIED").toUpperCase() : null
        const label = `${String(row[block.groupBy] ?? "Unspecified")}${currency ? ` · ${currency}` : ""}`
        buckets.set(label, [...(buckets.get(label) ?? []), row])
      }
      const result = [...buckets].map(([label, bucket]) => ({ label, value: aggregate(bucket, block.metric) ?? 0 })).sort((a, b) => b.value - a.value).slice(0, block.limit ?? 12)
      blocks.push({ type: "share", title: block.title, caption: monetary(block.metric, source) ? "Currency buckets are kept separate; no cross-currency total is calculated." : undefined, rows: result })
      continue
    }
    if (block.type === "kpi") {
      const items = block.items.flatMap((item) => {
        const buckets = monetary(item.metric, source) ? currencies(rows, source.currencyField) : [null]
        return buckets.map((currency) => {
          const bucket = currency ? rows.filter((row) => String(row[source.currencyField!] ?? "UNSPECIFIED").toUpperCase() === currency) : rows
          return { label: `${item.label}${currency ? ` · ${currency}` : ""}`, value: formatMetric(aggregate(bucket, item.metric), currency), note: currency ? "currency bucket" : undefined }
        })
      })
      blocks.push({ type: "kpi", items })
      continue
    }
    const buckets = monetary(block.metric, source) ? currencies(rows, source.currencyField) : [null]
    if (buckets.length > 1) { blocks.push(suppressed("stat", `Multiple currencies were found (${buckets.join(", ")}). Use a KPI block for separated currency values or filter to one currency.`)); continue }
    blocks.push({ type: "stat", title: block.title, value: formatMetric(aggregate(rows, block.metric), buckets[0]) })
  }
  return {
    title: definition.title,
    subtitle: definition.description ?? `${displayPeriod.from} to ${displayPeriod.to}`,
    period: displayPeriod,
    generatedAt: now.toISOString(),
    coverage: { statement: rows.length ? `${rows.length} matching rows from ${source.sourceLabel}; excluded and superseded records are omitted.` : noRows, complete: rows.length > 0 },
    blocks,
    method: `Source: Smart Storage ${source.sourceLabel}. Definition ${definition.slug} version ${definition.version}. Currency buckets are never combined without conversion.`,
  }
}

function scalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "string") return value
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return JSON.stringify(value)
}
