import { loadReportDefinitionSource, type LoadedReportDefinitionSource } from "@/lib/report-definition-engine"
import { referencedDefinitionFields, type ReportDefinition, type ReportDefinitionFilter, type ReportMetric } from "@/lib/report-definitions"
import { validateDashboardVisualDefinition, type DashboardVisualDefinition } from "@/lib/dashboard-visual-definition"

type Row = Record<string, unknown>
export type ResolvedDashboardVisual = {
  source: "definition"
  definition: DashboardVisualDefinition
  data: Array<{ label: string; value: number; currency?: string }>
  x_key: "label"
  data_key: "value"
  coverage: { rowCount: number; complete: boolean; statement: string }
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

function aggregate(rows: Row[], metric: ReportMetric) {
  if (metric.aggregation === "count") return metric.field ? rows.filter((row) => row[metric.field!] != null && row[metric.field!] !== "").length : rows.length
  const values = rows.map((row) => typeof row[metric.field!] === "number" ? row[metric.field!] as number : Number(row[metric.field!])).filter(Number.isFinite)
  if (!values.length) return 0
  if (metric.aggregation === "sum") return values.reduce((sum, value) => sum + value, 0)
  if (metric.aggregation === "average") return values.reduce((sum, value) => sum + value, 0) / values.length
  if (metric.aggregation === "min") return Math.min(...values)
  return Math.max(...values)
}

function dimensionValue(value: unknown, grain?: "day" | "month" | "year") {
  const label = String(value ?? "Unspecified")
  if (!grain) return label
  if (grain === "year") return label.slice(0, 4)
  if (grain === "month") return label.slice(0, 7)
  return label.slice(0, 10)
}

export function compileDashboardVisual(definition: DashboardVisualDefinition, source: LoadedReportDefinitionSource): ResolvedDashboardVisual {
  const fakeDefinition = { filters: definition.filters, source: definition.source, blocks: [{ type: "share", title: "Visual", groupBy: definition.dimension.field, metric: definition.metric }] } as unknown as ReportDefinition
  const unknown = referencedDefinitionFields(fakeDefinition).filter((field) => !source.availableFields.has(field))
  if (unknown.length) throw new TypeError(`Visual references unavailable fields: ${unknown.join(", ")}`)
  const rows = source.rows.filter((row) => definition.filters.every((filter) => compare(row[filter.field], filter)))
  const splitCurrency = Boolean(source.currencyField && definition.metric.aggregation !== "count")
  const groups = new Map<string, { label: string; currency?: string; rows: Row[] }>()
  for (const row of rows) {
    const label = dimensionValue(row[definition.dimension.field], definition.dimension.grain)
    const currency = splitCurrency ? String(row[source.currencyField!] ?? "UNSPECIFIED").trim().toUpperCase() || "UNSPECIFIED" : undefined
    const key = `${label}\u0000${currency ?? ""}`
    const group = groups.get(key) ?? { label: currency ? `${label} · ${currency}` : label, ...(currency ? { currency } : {}), rows: [] }
    group.rows.push(row); groups.set(key, group)
  }
  const chronological = Boolean(definition.dimension.grain)
  const data = [...groups.values()].map((group) => ({ label: group.label, value: aggregate(group.rows, definition.metric), ...(group.currency ? { currency: group.currency } : {}) }))
    .sort((a, b) => chronological ? a.label.localeCompare(b.label) : b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, definition.limit)
  return {
    source: "definition", definition, data, x_key: "label", data_key: "value",
    coverage: { rowCount: rows.length, complete: rows.length > 0, statement: rows.length ? `${rows.length} current rows; excluded and superseded records are omitted. Currency values remain separated.` : "No current rows match this visual definition." },
  }
}

export async function executeDashboardVisual(userId: string, input: unknown): Promise<ResolvedDashboardVisual> {
  const validated = validateDashboardVisualDefinition(input)
  if (!validated.ok) throw new TypeError(validated.error)
  const definition = validated.value
  const reportDefinition = {
    id: "dashboard-visual", user_id: userId, slug: "dashboard-visual", title: "Dashboard visual", description: null,
    authored_by: "assistant", version: 1, archived_at: null, created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
    source: definition.source, scope: definition.scope, period: definition.period, filters: definition.filters,
    blocks: [{ type: "share", title: "Visual", groupBy: definition.dimension.field, metric: definition.metric, limit: definition.limit }], theme: null,
  } satisfies ReportDefinition
  return compileDashboardVisual(definition, await loadReportDefinitionSource(userId, reportDefinition))
}
