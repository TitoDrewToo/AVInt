import {
  validateReportDefinitionPayload,
  type ReportDefinitionFilter,
  type ReportDefinitionPeriod,
  type ReportDefinitionScope,
  type ReportDefinitionSource,
  type ReportMetric,
} from "@/lib/report-definitions"

export const DEFINITION_VISUAL_RENDERERS = ["line-chart", "area-chart", "bar-chart", "pie-chart"] as const
export type DefinitionVisualRenderer = typeof DEFINITION_VISUAL_RENDERERS[number]
export type DashboardVisualDefinition = {
  renderer: DefinitionVisualRenderer
  source: ReportDefinitionSource
  scope: ReportDefinitionScope | null
  period: ReportDefinitionPeriod
  filters: ReportDefinitionFilter[]
  dimension: { field: string; grain?: "day" | "month" | "year" }
  metric: ReportMetric
  limit: number
}

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

export function validateDashboardVisualDefinition(input: unknown): { ok: true; value: DashboardVisualDefinition } | { ok: false; error: string } {
  if (!object(input)) return { ok: false, error: "Visual definition must be an object" }
  if (!DEFINITION_VISUAL_RENDERERS.includes(input.renderer as DefinitionVisualRenderer)) return { ok: false, error: "Visual renderer is unsupported" }
  if (!object(input.dimension) || typeof input.dimension.field !== "string") return { ok: false, error: "Visual dimension.field is required" }
  const grain = input.dimension.grain
  if (grain !== undefined && !["day", "month", "year"].includes(String(grain))) return { ok: false, error: "Visual dimension.grain is unsupported" }
  const limit = input.limit === undefined ? 24 : Number(input.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, error: "Visual limit must be 1–100" }

  const report = validateReportDefinitionPayload({
    title: "Dashboard visual",
    description: null,
    source: input.source,
    scope: input.scope ?? null,
    period: input.period ?? { kind: "all" },
    filters: input.filters ?? [],
    blocks: [{ type: "share", title: "Visual", groupBy: input.dimension.field, metric: input.metric, limit }],
    theme: null,
  })
  if (!report.ok) return { ok: false, error: report.error }
  const block = report.value.blocks[0]
  if (block.type !== "share") return { ok: false, error: "Visual definition could not be normalized" }
  return {
    ok: true,
    value: {
      renderer: input.renderer as DefinitionVisualRenderer,
      source: report.value.source,
      scope: report.value.scope,
      period: report.value.period,
      filters: report.value.filters,
      dimension: { field: block.groupBy, ...(grain ? { grain: grain as "day" | "month" | "year" } : {}) },
      metric: block.metric,
      limit,
    },
  }
}
