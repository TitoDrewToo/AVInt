import { supabaseAdmin } from "@/lib/mcp-auth"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import type { ReportBlock, ReportDocument } from "@/lib/report-document"
import { RECORD_DEFINITION_FIELDS, referencedDefinitionFields, type ReportDefinition, type ReportDefinitionFilter, type ReportMetric, type ReportDefinitionPeriod } from "@/lib/report-definitions"
import { getVirtualDatasetDefinition } from "@/lib/virtual-dataset-store"
import type { VirtualDatasetDefinition } from "@/lib/virtual-dataset-definitions"

const MAX_SOURCE_ROWS = 5_000
const CORE_FIELDS = new Set<string>([...RECORD_DEFINITION_FIELDS, "filename", "folder_id"])

type ValueRow = Record<string, unknown>
export type LoadedReportDefinitionSource = { rows: ValueRow[]; availableFields: Set<string>; dateField: string | null; currencyField: string | null; sourceLabel: string; coverageNote?: string }

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

async function loadRecords(userId: string, definition: ReportDefinition, periodOverride?: ReportDefinitionPeriod): Promise<LoadedReportDefinitionSource> {
  const period = expandedPeriod(definition, periodOverride) ?? { from: "", to: "" }
  const context = await createReportQueryContext(userId, { targetFolder: definition.scope?.folderId })
  const scopedFileIds = await context.fileIds(definition.source.kind === "records" ? definition.source.documentTypes ?? [] : [])
  const selectedFileIds = definition.source.kind === "records" ? definition.source.fileIds : undefined
  const fileIds = selectedFileIds ? selectedFileIds.filter((id) => scopedFileIds.includes(id)) : scopedFileIds
  const sourceLabel = selectedFileIds ? `selected canonical records from ${fileIds.length} file(s)` : "canonical records"
  if (!fileIds.length) return { rows: [], availableFields: new Set(CORE_FIELDS), dateField: "occurred_on", currencyField: "currency", sourceLabel }
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
  return { rows, availableFields, dateField: "occurred_on", currencyField: "currency", sourceLabel }
}

async function loadDataset(userId: string, definition: ReportDefinition, periodOverride?: ReportDefinitionPeriod): Promise<LoadedReportDefinitionSource> {
  if (definition.source.kind !== "dataset") throw new ReportDefinitionExecutionError("Dataset source expected")
  const source = definition.source
  const context = source.folderId ? await createReportQueryContext(userId, { targetFolder: source.folderId }) : null
  const scopedIds = context ? await context.fileIds() : null
  if (source.folderId && !scopedIds?.length) throw new ReportDefinitionExecutionError("The selected folder contains no files or datasets")
  let selectedFiles: Array<{ id: string; filename: string; folder_id: string | null }> = []
  if (source.fileIds) {
    const { data: files, error: filesError } = await supabaseAdmin.from("files").select("id, filename, folder_id").eq("user_id", userId).in("id", source.fileIds)
    if (filesError) throw new Error(filesError.message)
    const byId = new Map((files ?? []).map((file) => [file.id, file]))
    if (byId.size !== source.fileIds.length || source.fileIds.some((id) => !byId.has(id))) throw new ReportDefinitionExecutionError("Selected files do not exist or are not accessible")
    selectedFiles = source.fileIds.map((id) => byId.get(id)!)
  }
  let datasetQuery = supabaseAdmin.from("datasets").select("id, name, file_id, sheet_name, files!inner(folder_id, filename)").eq("user_id", userId).eq("files.user_id", userId)
  if (source.datasetId) datasetQuery = datasetQuery.eq("id", source.datasetId)
  else datasetQuery = datasetQuery.in("file_id", source.fileIds ?? scopedIds ?? [])
  const { data: datasets, error } = await datasetQuery
  if (error) throw new Error(error.message)
  if (!datasets?.length) throw new ReportDefinitionExecutionError(source.folderId ? "The selected folder has no datasets" : source.fileIds ? "The selected files contain no datasets" : "The selected dataset does not exist or is not accessible")
  if (definition.scope?.folderId && (source.datasetId || source.fileIds)) {
    const scopeContext = await createReportQueryContext(userId, { targetFolder: definition.scope.folderId })
    const scopeIds = await scopeContext.fileIds()
    const guardedFileIds = source.fileIds ?? [datasets[0].file_id]
    if (guardedFileIds.some((id) => !scopeIds.includes(id))) throw new ReportDefinitionExecutionError("A selected dataset is outside the report folder scope")
  }
  const loaded: Array<{ dataset: any; columns: Array<{ key: string; data_type: string }>; rows: ValueRow[] }> = []
  for (const dataset of datasets) {
    const { data: columns, error: columnError } = await supabaseAdmin.from("dataset_columns").select("key, data_type").eq("dataset_id", dataset.id).eq("user_id", userId)
    if (columnError) throw new Error(columnError.message)
    const { data: rows, error: rowError } = await supabaseAdmin.from("dataset_rows").select("data").eq("dataset_id", dataset.id).eq("user_id", userId).order("row_index").limit(MAX_SOURCE_ROWS + 1)
    if (rowError) throw new Error(rowError.message)
    loaded.push({ dataset, columns: columns ?? [], rows: (rows ?? []).map((row) => ({ ...(row.data as ValueRow), __dataset_id: dataset.id, __dataset_name: dataset.name, __file_id: dataset.file_id })) })
  }
  if (source.fileIds) {
    const filePosition = new Map(source.fileIds.map((id, index) => [id, index]))
    loaded.sort((a, b) => (filePosition.get(a.dataset.file_id) ?? Number.MAX_SAFE_INTEGER) - (filePosition.get(b.dataset.file_id) ?? Number.MAX_SAFE_INTEGER) || String(a.dataset.sheet_name).localeCompare(String(b.dataset.sheet_name)) || String(a.dataset.id).localeCompare(String(b.dataset.id)))
  } else if (source.folderId) loaded.sort((a, b) => String(a.dataset.id).localeCompare(String(b.dataset.id)))
  const signature = (columns: Array<{ key: string; data_type: string }>) => columns.map((column) => `${column.key}:${column.data_type}`).sort().join("|")
  const baseSignature = signature(loaded[0].columns)
  const compatible = loaded.filter((item) => signature(item.columns) === baseSignature)
  const excluded = loaded.filter((item) => signature(item.columns) !== baseSignature)
  if (!compatible.length) throw new ReportDefinitionExecutionError("No compatible datasets were found in the selected folder")
  const availableFields = new Set(compatible[0].columns.map((column) => column.key))
  let values = compatible.flatMap((item) => item.rows)
  if (values.length > MAX_SOURCE_ROWS) throw new ReportDefinitionExecutionError(`The report source exceeds ${MAX_SOURCE_ROWS} dataset rows. Narrow the folder before running this report.`)
  const period = expandedPeriod(definition, periodOverride) ?? { from: "", to: "" }
  if ((period.from || period.to) && !source.dateField) throw new ReportDefinitionExecutionError("A dataset report with a period requires source.dateField")
  if (source.dateField && (period.from || period.to)) values = values.filter((row) => overlaps(String(row[source.dateField!] ?? ""), String(row[source.dateField!] ?? ""), period.from, period.to))
  const filesWithDatasets = new Set(loaded.map((item) => item.dataset.file_id))
  const withoutDatasets = selectedFiles.filter((file) => !filesWithDatasets.has(file.id))
  const unioned = Boolean(source.folderId || source.fileIds)
  const coverageNote = unioned
    ? `${compatible.length} compatible dataset(s) unioned without de-duplication${excluded.length ? `; excluded ${excluded.map((item) => `${item.dataset.name} (schema mismatch)`).join(", ")}` : ""}${withoutDatasets.length ? `; excluded ${withoutDatasets.map((file) => `${file.filename} (no dataset)`).join(", ")}` : ""}.`
    : undefined
  const sourceLabel = source.folderId ? "folder dataset union" : source.fileIds ? `selected-file dataset union from ${selectedFiles.length} file(s)` : `dataset ${compatible[0].dataset.name}`
  return { rows: values, availableFields, dateField: source.dateField ?? null, currencyField: source.currencyField ?? null, sourceLabel, coverageNote }
}

export async function loadReportDefinitionSource(userId: string, definition: ReportDefinition, periodOverride?: ReportDefinitionPeriod): Promise<LoadedReportDefinitionSource> {
  if (definition.source.kind === "records") return loadRecords(userId, definition, periodOverride)
  if (definition.source.kind === "dataset") return loadDataset(userId, definition, periodOverride)
  const virtual = await getVirtualDatasetDefinition(userId, definition.source.slug)
  const materializedDefinition: ReportDefinition = { ...definition, source: virtual.source, scope: virtual.scope }
  const loaded = virtual.source.kind === "records"
    ? await loadRecords(userId, materializedDefinition, periodOverride)
    : await loadDataset(userId, materializedDefinition, periodOverride)
  return applyVirtualDatasetDefinition(virtual, loaded)
}

export function applyVirtualDatasetDefinition(virtual: VirtualDatasetDefinition, loaded: LoadedReportDefinitionSource): LoadedReportDefinitionSource {
  const projectedFields = new Set(virtual.fields)
  const rows = loaded.rows
    .filter((row) => virtual.filters.every((filter) => compare(row[filter.field], filter)))
    .map((row) => Object.fromEntries(Object.entries(row).filter(([field]) => projectedFields.has(field) || field.startsWith("__"))))
  const availableFields = new Set([...loaded.availableFields].filter((field) => projectedFields.has(field)))
  const virtualNote = `Virtual dataset ${virtual.slug} v${virtual.version} projects ${virtual.fields.length} field(s).`
  return {
    rows,
    availableFields,
    dateField: loaded.dateField && projectedFields.has(loaded.dateField) ? loaded.dateField : null,
    currencyField: loaded.currencyField && projectedFields.has(loaded.currencyField) ? loaded.currencyField : null,
    sourceLabel: `virtual dataset ${virtual.title}`,
    coverageNote: loaded.coverageNote ? `${virtualNote} ${loaded.coverageNote}` : virtualNote,
  }
}

function resolvePeriod(period: ReportDefinitionPeriod) {
  if (period.kind === "fixed") return { from: period.from, to: period.to }
  if (period.kind === "rolling") return rollingBounds(period.unit, period.count, period.offset ?? 0, new Date())
  return { from: "", to: "" }
}

function expandedPeriod(definition: ReportDefinition, periodOverride?: ReportDefinitionPeriod) {
  const period = periodOverride ?? definition.period
  const resolved = period.kind === "all" ? null : (period.kind === "fixed" ? { from: period.from, to: period.to } : rollingBounds(period.unit, period.count, period.offset ?? 0, new Date()))
  if (!resolved || !definition.blocks.some((block) => block.type === "comparison")) return resolved
  const from = new Date(`${resolved.from}T00:00:00Z`); const to = new Date(`${resolved.to}T00:00:00Z`)
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  from.setUTCDate(from.getUTCDate() - days)
  return { from: from.toISOString().slice(0, 10), to: resolved.to }
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
function aggregate(rows: ValueRow[], metric: ReportMetric): number | null {
  if (metric.aggregation === "ratio") {
    const denominator = aggregate(rows, { aggregation: "sum", field: metric.denominator })
    const numerator = aggregate(rows, { aggregation: "sum", field: metric.numerator })
    if (denominator === null || denominator === 0 || numerator === null) return null
    return numerator / denominator
  }
  if (metric.aggregation === "count") return metric.field ? rows.filter((row) => row[metric.field!] !== null && row[metric.field!] !== undefined && row[metric.field!] !== "").length : rows.length
  if (metric.aggregation === "count_distinct") return new Set(rows.map((row) => row[metric.field!]).filter((value) => value !== null && value !== undefined && value !== "").map((value) => String(value))).size
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
function monetary(metric: ReportMetric, source: LoadedReportDefinitionSource) {
  return Boolean(source.currencyField && metric.aggregation !== "ratio" && metric.field && ["amount", "amount_base", "total_amount", "gross_income", "net_income", "tax_amount"].includes(metric.field))
}
function formatMetric(value: number | null, currency: string | null) { return value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}${currency ? ` ${currency}` : ""}` }
function suppressed(type: ReportBlock["type"], reason: string): ReportBlock & { suppressed: true; reason: string } {
  if (type === "kpi") return { type, items: [], suppressed: true, reason }
  if (type === "share") return { type, title: "Not stated", rows: [], suppressed: true, reason }
  if (type === "table") return { type, title: "Not stated", columns: [], rows: [], suppressed: true, reason }
  if (type === "stat") return { type, title: "Not stated", value: "", suppressed: true, reason }
  if (type === "series") return { type, title: "Not stated", bucket: "day", points: [], gaps: 0, suppressed: true, reason }
  if (type === "comparison") return { type, title: "Not stated", items: [], suppressed: true, reason }
  if (type === "narrative") return { type, title: "Not stated", text: "", suppressed: true, reason }
  return { type: "note", text: reason, suppressed: true, reason }
}

export async function runReportDefinition(userId: string, definition: ReportDefinition, now = new Date(), periodOverride?: ReportDefinitionPeriod): Promise<ReportDocument> {
  const source = await loadReportDefinitionSource(userId, definition, periodOverride)
  return compileReportDefinition(definition, source, now, periodOverride)
}

function dateInRange(row: ValueRow, dateField: string | null, from: string, to: string) {
  if (!dateField) return false
  const value = String(row[dateField] ?? "")
  return Boolean(value) && (!from || value >= from) && (!to || value <= to)
}

function bucketDate(value: string, bucket: "day" | "week" | "month" | "quarter") {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return null
  if (bucket === "day") return value
  if (bucket === "month") return value.slice(0, 7)
  if (bucket === "quarter") return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() - day + 1)
  return date.toISOString().slice(0, 10)
}

function buildSeries(rows: ValueRow[], block: Extract<ReportDefinition["blocks"][number], { type: "series" }>, period: { from: string; to: string }): ReportBlock {
  const dates = rows.map((row) => String(row[block.timeField] ?? "")).filter(Boolean).sort()
  const from = period.from || dates[0]
  const to = period.to || dates.at(-1)
  if (!from || !to) return { type: "series", title: block.title, bucket: block.bucket, points: [], gaps: 0, caption: "No dates were available." }
  const buildPoints = (seriesRows: ValueRow[]) => {
    const points: Array<{ bucket: string; label?: string; value: number | null }> = []
    const cursor = new Date(`${from}T00:00:00Z`); const end = new Date(`${to}T00:00:00Z`)
    const increment = () => { if (block.bucket === "day") cursor.setUTCDate(cursor.getUTCDate() + 1); else if (block.bucket === "week") cursor.setUTCDate(cursor.getUTCDate() + 7); else if (block.bucket === "month") cursor.setUTCMonth(cursor.getUTCMonth() + 1); else cursor.setUTCMonth(cursor.getUTCMonth() + 3) }
    while (cursor <= end) {
      const key = bucketDate(cursor.toISOString().slice(0, 10), block.bucket)
      if (!key) break
      const bucketRows = seriesRows.filter((row) => bucketDate(String(row[block.timeField] ?? ""), block.bucket) === key)
      points.push({ bucket: key, label: key, value: bucketRows.length ? aggregate(bucketRows, block.metric) : null })
      increment()
    }
    return points
  }
  const points = buildPoints(rows)
  const gaps = points.filter((point) => point.value === null).length
  const caption = gaps ? `${gaps} bucket${gaps === 1 ? "" : "s"} have no data; values are not interpolated.` : undefined
  if (!block.splitBy) return { type: "series", title: block.title, bucket: block.bucket, points, gaps, caption }
  const grouped = new Map<string, ValueRow[]>()
  for (const row of rows) { const key = String(row[block.splitBy] ?? "Unspecified"); grouped.set(key, [...(grouped.get(key) ?? []), row]) }
  const ranked = [...grouped.entries()].sort((a, b) => (aggregate(b[1], block.metric) ?? 0) - (aggregate(a[1], block.metric) ?? 0))
  const selected = ranked.slice(0, block.limit ?? 5).map(([key, seriesRows]) => ({ key, points: buildPoints(seriesRows), gaps: buildPoints(seriesRows).filter((point) => point.value === null).length }))
  const dropped = Math.max(0, ranked.length - selected.length)
  return { type: "series", title: block.title, bucket: block.bucket, points, gaps, caption: `${selected.length} series shown${dropped ? `; ${dropped} lower-volume series omitted.` : "."}`, series: selected }
}

export function compileReportDefinition(definition: ReportDefinition, source: LoadedReportDefinitionSource, now = new Date(), periodOverride?: ReportDefinitionPeriod): ReportDocument {
  const unknownFields = referencedDefinitionFields(definition).filter((field) => !source.availableFields.has(field))
  if (unknownFields.length) throw new ReportDefinitionExecutionError(`Definition references unavailable fields: ${unknownFields.join(", ")}`)
  const period = periodOverride ? resolvePeriod(periodOverride) : resolveDefinitionPeriod(definition, now)
  const rows = source.rows.filter((row) => definition.filters.every((filter) => compare(row[filter.field], filter)) && (!source.dateField || (!period.from && !period.to) || dateInRange(row, source.dateField, period.from, period.to)))
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
    if (block.type === "series") {
      if (!source.availableFields.has(block.timeField)) throw new ReportDefinitionExecutionError(`Series timeField is unavailable: ${block.timeField}`)
      blocks.push(buildSeries(rows, block, period))
      continue
    }
    if (block.type === "comparison") {
      if (definition.period.kind === "all" && !periodOverride) throw new ReportDefinitionExecutionError("Comparison blocks require a fixed or rolling period")
      if (!period.from || !period.to || !source.dateField) throw new ReportDefinitionExecutionError("Comparison blocks require a resolvable date period")
      const currentFrom = new Date(`${period.from}T00:00:00Z`); const currentTo = new Date(`${period.to}T00:00:00Z`)
      const span = Math.round((currentTo.getTime() - currentFrom.getTime()) / 86400000) + 1
      const previousTo = new Date(currentFrom); previousTo.setUTCDate(previousTo.getUTCDate() - 1)
      const previousFrom = new Date(previousTo); previousFrom.setUTCDate(previousFrom.getUTCDate() - span + 1)
      const previousRows = source.rows.filter((row) => dateInRange(row, source.dateField, previousFrom.toISOString().slice(0, 10), previousTo.toISOString().slice(0, 10)))
      const previousDates = new Set(previousRows.map((row) => String(row[source.dateField!] ?? "")).filter(Boolean))
      const currentDates = new Set(rows.map((row) => String(row[source.dateField!] ?? "")).filter(Boolean))
      const coverageComplete = currentDates.size >= span && previousDates.size >= span
      blocks.push({ type: "comparison", title: block.title, items: block.items.map((item) => {
        const current = aggregate(rows, item.metric); const previous = aggregate(previousRows, item.metric)
        if (!coverageComplete || current === null || previous === null) return { label: item.label, current: formatMetric(current, null), previous: formatMetric(previous, null), delta: null, deltaLabel: "Unavailable: coverage is incomplete", direction: "unavailable" as const }
        const delta = current - previous
        return { label: item.label, current: formatMetric(current, null), previous: formatMetric(previous, null), delta, deltaLabel: `${delta >= 0 ? "+" : ""}${delta.toLocaleString("en-US", { maximumFractionDigits: 2 })}${previous !== 0 ? ` (${((delta / previous) * 100).toFixed(1)}%)` : ""}`, direction: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "flat" as const }
      }) })
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
    if (block.metric.aggregation === "ratio" && aggregate(rows, block.metric) === null && block.metric.onZero === "suppress") { blocks.push(suppressed("stat", "Ratio suppressed because the denominator is zero or unavailable.")); continue }
    blocks.push({ type: "stat", title: block.title, value: formatMetric(aggregate(rows, block.metric), buckets[0]) })
  }
  return {
    title: definition.title,
    subtitle: definition.description ?? `${displayPeriod.from} to ${displayPeriod.to}`,
    period: displayPeriod,
    generatedAt: now.toISOString(),
    coverage: { statement: rows.length ? `${rows.length} matching rows from ${source.sourceLabel}; excluded and superseded records are omitted. ${source.coverageNote ?? ""}` : noRows, complete: rows.length > 0 },
    blocks,
    theme: definition.theme ?? undefined,
    method: `Source: Smart Storage ${source.sourceLabel}. Definition ${definition.slug} version ${definition.version}. Currency buckets are never combined without conversion.`,
  }
}

function scalar(value: unknown): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "string") return value
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return JSON.stringify(value)
}
