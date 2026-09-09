export const RECORD_DEFINITION_FIELDS = [
  "occurred_on", "period_start", "period_end", "amount", "amount_base", "currency", "direction",
  "counterparty", "counterparty_normalized", "category", "description", "document_type", "record_type",
  "is_recurring", "confidence", "needs_review",
] as const

export type MaterializedReportDefinitionSource =
  | { kind: "records"; documentTypes?: string[]; fileIds?: string[] }
  | { kind: "dataset"; datasetId?: string; folderId?: string; fileIds?: string[]; dateField?: string; currencyField?: string }
export type ReportDefinitionSource = MaterializedReportDefinitionSource | { kind: "virtual_dataset"; slug: string }
export type ReportDefinitionScope = { folderId?: string | null }
export type ReportDefinitionPeriod =
  | { kind: "all" }
  | { kind: "fixed"; from: string; to: string }
  | { kind: "rolling"; unit: "month" | "year"; count: number; offset?: number }
export type ReportDefinitionFilter = { field: string; operator: "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte"; value: string | number | boolean | null }
export type ReportMetric = { aggregation: "count" | "count_distinct" | "sum" | "average" | "min" | "max" | "ratio"; field?: string; numerator?: string; denominator?: string; onZero?: "suppress" | "null" }
export type ReportDefinitionBlock =
  | { type: "kpi"; items: Array<{ label: string; metric: ReportMetric }> }
  | { type: "share"; title: string; groupBy: string; metric: ReportMetric; limit?: number }
  | { type: "table"; title: string; columns: Array<{ field: string; label?: string }>; sort?: { field: string; direction: "asc" | "desc" }; limit?: number }
  | { type: "stat"; title: string; metric: ReportMetric }
  | { type: "series"; title: string; timeField: string; bucket: "day" | "week" | "month" | "quarter"; metric: ReportMetric; splitBy?: string; limit?: number }
  | { type: "comparison"; title: string; against: "previous_period"; items: Array<{ label: string; metric: ReportMetric }> }
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
  theme: { accent?: string; density?: "compact" | "comfortable"; client?: { name: string; logoUrl?: string }; footer?: string } | null
}
export type ReportDefinition = ReportDefinitionInput & {
  id: string; user_id: string; slug: string; authored_by: "user" | "assistant"; version: number
  archived_at: string | null; created_at: string; updated_at: string
}
export type ReportDefinitionListItem = Pick<ReportDefinition, "slug" | "title" | "description" | "source" | "period" | "authored_by" | "version" | "updated_at">

const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,199}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const HEX_COLOR = /^#[0-9a-f]{6}$/i
const FILTER_OPERATORS = new Set(["eq", "neq", "contains", "gt", "gte", "lt", "lte"])
const AGGREGATIONS = new Set(["count", "count_distinct", "sum", "average", "min", "max", "ratio"])
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value) }
function text(value: unknown, max: number) { return typeof value === "string" && value.trim() && value.trim().length <= max ? value.trim() : null }
function validField(value: unknown): value is string { return typeof value === "string" && FIELD_PATTERN.test(value) }
function validatedFileIds(value: unknown): { ok: true; value?: string[] } | { ok: false } {
  if (value === undefined) return { ok: true }
  if (!Array.isArray(value) || value.length < 1 || value.length > 100 || value.some((item) => typeof item !== "string" || !UUID_PATTERN.test(item))) return { ok: false }
  const normalized = value.map((item) => item.toLowerCase())
  return new Set(normalized).size === normalized.length ? { ok: true, value: normalized } : { ok: false }
}
function realDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
function validateMetric(input: unknown, path: string): { ok: true; value: ReportMetric } | { ok: false; error: string } {
  if (!isObject(input) || !AGGREGATIONS.has(String(input.aggregation))) return { ok: false, error: `${path}.aggregation is unsupported` }
  const aggregation = input.aggregation as ReportMetric["aggregation"]
  if (aggregation === "ratio") {
    if (!validField(input.numerator) || !validField(input.denominator) || (input.onZero !== "suppress" && input.onZero !== "null")) return { ok: false, error: `${path} ratio requires numerator, denominator, and onZero` }
    if (input.field !== undefined) return { ok: false, error: `${path}.field is not allowed for ratio` }
    return { ok: true, value: { aggregation: "ratio", numerator: input.numerator, denominator: input.denominator, onZero: input.onZero } }
  }
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
  if (input.type === "series") {
    const title = text(input.title, 120)
    if (!title || !validField(input.timeField) || !["day", "week", "month", "quarter"].includes(String(input.bucket))) return { ok: false, error: `${path} needs title, timeField, and a valid bucket` }
    const metric = validateMetric(input.metric, `${path}.metric`)
    if (!metric.ok) return metric
    const limit = input.limit === undefined ? 5 : Number(input.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) return { ok: false, error: `${path}.limit must be 1–20` }
    if (input.splitBy !== undefined && !validField(input.splitBy)) return { ok: false, error: `${path}.splitBy is invalid` }
    return { ok: true, value: { type: "series", title, timeField: input.timeField, bucket: input.bucket as "day" | "week" | "month" | "quarter", metric: metric.value, ...(input.splitBy ? { splitBy: input.splitBy } : {}), limit } }
  }
  if (input.type === "comparison") {
    const title = text(input.title, 120)
    if (!title || input.against !== "previous_period" || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 8) return { ok: false, error: `${path} comparison is invalid` }
    const items: Array<{ label: string; metric: ReportMetric }> = []
    for (const [itemIndex, item] of input.items.entries()) {
      if (!isObject(item) || !text(item.label, 80)) return { ok: false, error: `${path}.items[${itemIndex}] is invalid` }
      const metric = validateMetric(item.metric, `${path}.items[${itemIndex}].metric`)
      if (!metric.ok) return metric
      items.push({ label: text(item.label, 80)!, metric: metric.value })
    }
    return { ok: true, value: { type: "comparison", title, against: "previous_period", items } }
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

// A title that names a period is a promise about what the report covers. If the
// definition does not scope that period, the label overstates the math — the
// failure CLAUDE.md prohibits, and the more dangerous because the number looks
// authoritative and is plausible.
//
// Deliberately narrow to keep false positives near zero: a four-digit year, an
// explicit quarter, or a relative-period phrase. Bare month names are NOT
// matched — "May" is an ordinary English word and would reject legitimate
// titles. A year is the unambiguous case and the one observed in the wild
// ("Total expenses by vendor for 2026" saved with period {kind:"all"}).
const PERIOD_NAMED_IN_TITLE = /\b(?:19|20)\d{2}\b|\bQ[1-4]\b|\b(?:last|this|past|previous)\s+(?:week|month|quarter|year)\b|\bYTD\b|\byear[- ]to[- ]date\b/i

export function titleNamesPeriod(title: string): boolean {
  return PERIOD_NAMED_IN_TITLE.test(title)
}

export function validateReportDefinitionPayload(input: unknown): { ok: true; value: ReportDefinitionInput } | { ok: false; error: string } {
  if (!isObject(input)) return { ok: false, error: "Definition must be an object" }
  const title = text(input.title, 120)
  if (!title) return { ok: false, error: "title is required and must be at most 120 characters" }
  if (!isObject(input.source) || !["records", "dataset", "virtual_dataset"].includes(String(input.source.kind))) return { ok: false, error: "source.kind must be records, dataset, or virtual_dataset" }
  let source: ReportDefinitionSource
  if (input.source.kind === "dataset") {
    const hasDataset = typeof input.source.datasetId === "string" && UUID_PATTERN.test(input.source.datasetId)
    const hasFolder = typeof input.source.folderId === "string" && UUID_PATTERN.test(input.source.folderId)
    const fileIds = validatedFileIds(input.source.fileIds)
    if (!fileIds.ok) return { ok: false, error: "source.fileIds must contain 1–100 unique UUIDs" }
    const hasFiles = Boolean(fileIds.value)
    if (Number(hasDataset) + Number(hasFolder) + Number(hasFiles) !== 1) return { ok: false, error: "dataset source requires exactly one of datasetId, folderId, or fileIds" }
    if ((input.source.datasetId !== undefined && !hasDataset) || (input.source.folderId !== undefined && !hasFolder)) return { ok: false, error: "source.datasetId/source.folderId must be UUIDs" }
    if (input.source.dateField !== undefined && !validField(input.source.dateField)) return { ok: false, error: "source.dateField is invalid" }
    if (input.source.currencyField !== undefined && !validField(input.source.currencyField)) return { ok: false, error: "source.currencyField is invalid" }
    source = { kind: "dataset", ...(hasDataset ? { datasetId: (input.source.datasetId as string).toLowerCase() } : hasFolder ? { folderId: (input.source.folderId as string).toLowerCase() } : { fileIds: fileIds.value! }), ...(input.source.dateField ? { dateField: input.source.dateField } : {}), ...(input.source.currencyField ? { currencyField: input.source.currencyField } : {}) }
  } else if (input.source.kind === "records") {
    if (input.source.documentTypes !== undefined && (!Array.isArray(input.source.documentTypes) || input.source.documentTypes.length > 20 || input.source.documentTypes.some((value) => !text(value, 80)))) return { ok: false, error: "source.documentTypes is invalid" }
    const fileIds = validatedFileIds(input.source.fileIds)
    if (!fileIds.ok) return { ok: false, error: "source.fileIds must contain 1–100 unique UUIDs" }
    source = { kind: "records", ...(Array.isArray(input.source.documentTypes) ? { documentTypes: input.source.documentTypes.map(String) } : {}), ...(fileIds.value ? { fileIds: fileIds.value } : {}) }
  } else {
    if (typeof input.source.slug !== "string" || !SLUG_PATTERN.test(input.source.slug)) return { ok: false, error: "source.slug must be a valid virtual dataset slug" }
    source = { kind: "virtual_dataset", slug: input.source.slug }
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
  if (period.kind === "all" && titleNamesPeriod(title)) {
    return {
      ok: false,
      error: `title names a period ("${title}") but the definition covers all time — set period to a fixed or rolling range, or remove the period from the title`,
    }
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
    const themeInput = isObject(input.theme) ? input.theme : {}
    const client = isObject(themeInput.client) && text(themeInput.client.name, 120) ? { name: text(themeInput.client.name, 120)! } : null
    if (!isObject(input.theme) || (themeInput.accent !== undefined && (typeof themeInput.accent !== "string" || !HEX_COLOR.test(themeInput.accent))) || (themeInput.density !== undefined && themeInput.density !== "compact" && themeInput.density !== "comfortable") || (themeInput.footer !== undefined && !text(themeInput.footer, 200)) || (themeInput.client !== undefined && !client)) return { ok: false, error: "theme is invalid" }
    const logoUrl = client && isObject(themeInput.client) && themeInput.client.logoUrl !== undefined ? themeInput.client.logoUrl : undefined
    if (logoUrl !== undefined && (typeof logoUrl !== "string" || !/^https:\/\/[^/]+\.supabase\.co\/storage\/v1\/object\/public\//.test(logoUrl))) return { ok: false, error: "theme.client.logoUrl must be a Supabase Storage URL" }
    theme = { ...(typeof themeInput.accent === "string" ? { accent: themeInput.accent } : {}), ...(themeInput.density ? { density: themeInput.density as "compact" | "comfortable" } : {}), ...(client ? { client: { ...client, ...(logoUrl ? { logoUrl } : {}) } } : {}), ...(typeof themeInput.footer === "string" ? { footer: themeInput.footer.trim() } : {}) }
  }
  return { ok: true, value: { title, description: typeof input.description === "string" ? input.description.trim().slice(0, 500) || null : null, source, scope, period, filters, blocks, theme } }
}

export function referencedDefinitionFields(definition: ReportDefinitionInput): string[] {
  const fields = new Set(definition.filters.map((filter) => filter.field))
  const addMetricFields = (metric: ReportMetric) => {
    if (metric.aggregation === "ratio") { fields.add(metric.numerator!); fields.add(metric.denominator!) }
    else if (metric.field) fields.add(metric.field)
  }
  if (definition.source.kind === "dataset") {
    if (definition.source.dateField) fields.add(definition.source.dateField)
    if (definition.source.currencyField) fields.add(definition.source.currencyField)
  }
  for (const block of definition.blocks) {
    if (block.type === "kpi") for (const item of block.items) addMetricFields(item.metric)
    if (block.type === "share") { fields.add(block.groupBy); addMetricFields(block.metric) }
    if (block.type === "table") { for (const column of block.columns) fields.add(column.field); if (block.sort) fields.add(block.sort.field) }
    if (block.type === "stat") addMetricFields(block.metric)
    if (block.type === "series") { fields.add(block.timeField); if (block.splitBy) fields.add(block.splitBy); addMetricFields(block.metric) }
    if (block.type === "comparison") for (const item of block.items) addMetricFields(item.metric)
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
