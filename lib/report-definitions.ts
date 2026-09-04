export const RECORD_DEFINITION_FIELDS = [
  "occurred_on", "period_start", "period_end", "amount", "amount_base", "currency", "direction",
  "counterparty", "counterparty_normalized", "category", "description", "document_type", "record_type",
  "is_recurring", "confidence", "needs_review",
] as const

export type ReportDefinitionSource =
  | { kind: "records"; documentTypes?: string[] }
  | { kind: "dataset"; datasetId: string; dateField?: string; currencyField?: string }
export type ReportDefinitionScope = { folderId?: string | null }
export type ReportDefinitionPeriod =
  | { kind: "all" }
  | { kind: "fixed"; from: string; to: string }
  | { kind: "rolling"; unit: "month" | "year"; count: number; offset?: number }
export type ReportDefinitionFilter = { field: string; operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean | null }
export type ReportMetric = { aggregation: "count" | "sum" | "average" | "min" | "max"; field?: string }
export type ReportDefinitionBlock =
  | { type: "kpi"; items: Array<{ label: string; metric: ReportMetric }> }
  | { type: "share"; title: string; groupBy: string; metric: ReportMetric; limit?: number }
  | { type: "table"; title: string; columns: Array<{ field: string; label?: string }>; sort?: { field: string; direction: "asc" | "desc" }; limit?: number }
  | { type: "stat"; title: string; metric: ReportMetric }
  | { type: "narrative"; title: string; text: string }
  | { type: "note"; text: string }
export type ReportDefinitionInput = {
  title: string
  description: string | null
  source: ReportDefinitionSource
  scope: ReportDefinitionScope | null
  period: ReportDefinitionPeriod
  filters: ReportDefinitionFilter[]
  blocks: ReportDefinitionBlock[]
  theme: { accent?: string; density?: "compact" | "comfortable" } | null
}
export type ReportDefinition = ReportDefinitionInput & {
  id: string; user_id: string; slug: string; authored_by: "user" | "assistant"; version: number
  archived_at: string | null; created_at: string; updated_at: string
}
export type ReportDefinitionListItem = Pick<ReportDefinition, "slug" | "title" | "description" | "source" | "period" | "authored_by" | "version" | "updated_at">

const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,199}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const FILTER_OPERATORS = new Set(["eq", "neq", "contains", "gt", "gte", "lt", "lte"])
const AGGREGATIONS = new Set(["count", "sum", "average", "min", "max"])
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value) }
function text(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null }
function validField(value: unknown): value is string { return typeof value === "string" && FIELD_PATTERN.test(value) }
function realDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function validateMetric(input: unknown, path: string): { ok: true; value: ReportMetric } | { ok: false; error: string } {
  if (!isObject(input) || !AGGREGATIONS.has(String(input.aggregation))) return { ok: false, error: `${path}.aggregation is unsupported` }
  const aggregation = input.aggregation as ReportMetric["aggregation"]
  if (aggregation !== "count" && !validField(input.field)) return { ok: false, error: `${path}.field is required for ${aggregation}` }
  if (input.field !== undefined && !validField(input.field)) return { ok: false, error: `${path}.field is invalid` }
  return { ok: true, value: { aggregation, ...(input.field ? { field: input.field } : {}) } }
}
function validateBlock(input: unknown, index: number): { ok: true; value: ReportDefinitionBlock } | { ok: false; error: string } {
  const path = `blocks[${index}]`
  if (!isObject(input)) return { ok: false, error: `${path} must be an object` }
  if (input.type === "kpi") {
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 8) return { ok: false, error: `${path}.items must contain 1–8 metrics` }
    const items: Array<{ label: string; metric: ReportMetric }> = []
    for (let itemIndex = 0; itemIndex < input.items.length; itemIndex += 1) {
      const item = input.items[itemIndex]
      if (!isObject(item) || !text(item.label, 80)) return { ok: false, error: `${path}.items[${itemIndex}].label is required` }
      const metric = validateMetric(item.metric, `${path}.items[${itemIndex}].metric`)
      if (!metric.ok) return metric
      items.push({ label: text(item.label, 80)!, metric: metric.value })
    }
    return { ok: true, value: { type: "kpi", items } }
  }
  if (input.type === "share") {
    const title = text(input.title, 120)
    if (!title || !validField(input.groupBy)) return { ok: false, error: `${path} needs a title and valid groupBy field` }
    const metric = validateMetric(input.metric, `${path}.metric`)
    if (!metric.ok) return metric
    const limit = input.limit === undefined ? 12 : Number(input.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { ok: false, error: `${path}.limit must be 1–50` }
    return { ok: true, value: { type: "share", title, groupBy: input.groupBy, metric: metric.value, limit } }
  }
  if (input.type === "table") {
    const title = text(input.title, 120)
    if (!title || !Array.isArray(input.columns) || input.columns.length < 1 || input.columns.length > 20) return { ok: false, error: `${path} needs a title and 1–20 columns` }
    const columns: Array<{ field: string; label?: string }> = []
    for (const column of input.columns) {
      if (!isObject(column) || !validField(column.field)) return { ok: false, error: `${path}.columns contains an invalid field` }
      const label = column.label === undefined ? null : text(column.label, 80)
      if (column.label !== undefined && !label) return { ok: false, error: `${path}.columns label is invalid` }
      columns.push({ field: column.field, ...(label ? { label } : {}) })
    }
    let sort: { field: string; direction: "asc" | "desc" } | undefined
    if (input.sort !== undefined) {
      if (!isObject(input.sort) || !validField(input.sort.field) || (input.sort.direction !== "asc" && input.sort.direction !== "desc")) return { ok: false, error: `${path}.sort is invalid` }
      sort = { field: input.sort.field, direction: input.sort.direction }
    }
    const limit = input.limit === undefined ? 100 : Number(input.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return { ok: false, error: `${path}.limit must be 1–500` }
    return { ok: true, value: { type: "table", title, columns, ...(sort ? { sort } : {}), limit } }
  }
  if (input.type === "stat") {
    const title = text(input.title, 120)
    if (!title) return { ok: false, error: `${path}.title is required` }
    const metric = validateMetric(input.metric, `${path}.metric`)
    return metric.ok ? { ok: true, value: { type: "stat", title, metric: metric.value } } : metric
  }
  if (input.type === "narrative") {
    const title = text(input.title, 120); const body = text(input.text, 1500)
    return title && body ? { ok: true, value: { type: "narrative", title, text: body } } : { ok: false, error: `${path} needs title and text` }
  }
  if (input.type === "note") {
    const body = text(input.text, 1500)
    return body ? { ok: true, value: { type: "note", text: body } } : { ok: false, error: `${path}.text is required` }
  }
  return { ok: false, error: `${path}.type is unsupported` }
}

export function validateReportDefinitionPayload(input: unknown): { ok: true; value: ReportDefinitionInput } | { ok: false; error: string } {
  if (!isObject(input)) return { ok: false, error: "Definition must be an object" }
  const title = text(input.title, 120)
  if (!title) return { ok: false, error: "title is required and must be at most 120 characters" }
  if (!isObject(input.source) || (input.source.kind !== "records" && input.source.kind !== "dataset")) return { ok: false, error: "source.kind must be records or dataset" }
  let source: ReportDefinitionSource
  if (input.source.kind === "dataset") {
    if (typeof input.source.datasetId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.source.datasetId)) return { ok: false, error: "source.datasetId must be a UUID" }
    if (input.source.dateField !== undefined && !validField(input.source.dateField)) return { ok: false, error: "source.dateField is invalid" }
    if (input.source.currencyField !== undefined && !validField(input.source.currencyField)) return { ok: false, error: "source.currencyField is invalid" }
    source = { kind: "dataset", datasetId: input.source.datasetId, ...(input.source.dateField ? { dateField: input.source.dateField } : {}), ...(input.source.currencyField ? { currencyField: input.source.currencyField } : {}) }
  } else {
    if (input.source.documentTypes !== undefined && (!Array.isArray(input.source.documentTypes) || input.source.documentTypes.length > 20 || input.source.documentTypes.some((value) => !text(value, 80)))) return { ok: false, error: "source.documentTypes is invalid" }
    source = { kind: "records", ...(Array.isArray(input.source.documentTypes) ? { documentTypes: input.source.documentTypes.map(String) } : {}) }
  }
  let scope: ReportDefinitionScope | null = null
  if (input.scope !== undefined && input.scope !== null) {
    if (!isObject(input.scope) || (input.scope.folderId !== undefined && input.scope.folderId !== null && (typeof input.scope.folderId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.scope.folderId)))) return { ok: false, error: "scope.folderId must be a UUID or null" }
    scope = { folderId: input.scope.folderId as string | null | undefined }
  }
  let period: ReportDefinitionPeriod = { kind: "all" }
  if (input.period !== undefined && input.period !== null) {
    if (!isObject(input.period)) return { ok: false, error: "period must be an object" }
    if (input.period.kind === "fixed") {
      if (!realDate(input.period.from) || !realDate(input.period.to) || input.period.from > input.period.to) return { ok: false, error: "fixed period requires a valid ordered from/to range" }
      period = { kind: "fixed", from: input.period.from, to: input.period.to }
    } else if (input.period.kind === "rolling") {
      const count = Number(input.period.count); const offset = input.period.offset === undefined ? 0 : Number(input.period.offset)
      if ((input.period.unit !== "month" && input.period.unit !== "year") || !Number.isInteger(count) || count < 1 || count > 120 || !Number.isInteger(offset) || offset < -120 || offset > 120) return { ok: false, error: "rolling period is invalid" }
      period = { kind: "rolling", unit: input.period.unit, count, offset }
    } else if (input.period.kind !== "all") return { ok: false, error: "period.kind must be all, fixed, or rolling" }
  }
  const filters: ReportDefinitionFilter[] = []
  if (input.filters !== undefined) {
    if (!Array.isArray(input.filters) || input.filters.length > 20) return { ok: false, error: "filters must contain at most 20 entries" }
    for (const filter of input.filters) {
      if (!isObject(filter) || !validField(filter.field) || !FILTER_OPERATORS.has(String(filter.operator)) || (!["string", "number", "boolean"].includes(typeof filter.value) && filter.value !== null)) return { ok: false, error: "filters contains an invalid entry" }
      filters.push({ field: filter.field, operator: filter.operator as ReportDefinitionFilter["operator"], value: filter.value as ReportDefinitionFilter["value"] })
    }
  }
  if (!Array.isArray(input.blocks) || input.blocks.length < 1 || input.blocks.length > 20) return { ok: false, error: "blocks must contain 1–20 entries" }
  const blocks: ReportDefinitionBlock[] = []
  for (let index = 0; index < input.blocks.length; index += 1) {
    const block = validateBlock(input.blocks[index], index)
    if (!block.ok) return block
    blocks.push(block.value)
  }
  let theme: ReportDefinitionInput["theme"] = null
  if (input.theme !== undefined && input.theme !== null) {
    if (!isObject(input.theme) || (input.theme.accent !== undefined && (typeof input.theme.accent !== "string" || !HEX_COLOR.test(input.theme.accent))) || (input.theme.density !== undefined && input.theme.density !== "compact" && input.theme.density !== "comfortable")) return { ok: false, error: "theme is invalid" }
    theme = { ...(typeof input.theme.accent === "string" ? { accent: input.theme.accent } : {}), ...(input.theme.density ? { density: input.theme.density as "compact" | "comfortable" } : {}) }
  }
  return { ok: true, value: { title, description: typeof input.description === "string" ? input.description.trim().slice(0, 500) || null : null, source, scope, period, filters, blocks, theme } }
}

export function referencedDefinitionFields(definition: ReportDefinitionInput): string[] {
  const fields = new Set(definition.filters.map((filter) => filter.field))
  if (definition.source.kind === "dataset") {
    if (definition.source.dateField) fields.add(definition.source.dateField)
    if (definition.source.currencyField) fields.add(definition.source.currencyField)
  }
  for (const block of definition.blocks) {
    if (block.type === "kpi") for (const item of block.items) if (item.metric.field) fields.add(item.metric.field)
    if (block.type === "share") { fields.add(block.groupBy); if (block.metric.field) fields.add(block.metric.field) }
    if (block.type === "table") { for (const column of block.columns) fields.add(column.field); if (block.sort) fields.add(block.sort.field) }
    if (block.type === "stat" && block.metric.field) fields.add(block.metric.field)
  }
  return [...fields]
}
export function slugifyReportTitle(title: string): string {
  const slug = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-")
  return slug.slice(0, 80).replace(/-+$/g, "") || "report"
}
export function slugWithSuffix(base: string, suffix: number): string {
  if (suffix === 1) return base
  const tail = `-${suffix}`
  return `${base.slice(0, 80 - tail.length).replace(/-+$/g, "") || "report"}${tail}`
}
