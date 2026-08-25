import { getEnabledAnalyticsWidgetTypes, type AdvancedWidgetType } from "@/lib/advanced-analytics-config"

export interface ValidatedDashboardWidgetSpec {
  widgetType: AdvancedWidgetType
  title: string
  description: string | null
  insight: string | null
}

const MAX_TITLE_LENGTH = 120
const MAX_DESCRIPTION_LENGTH = 500
const MAX_INSIGHT_LENGTH = 800

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text.length > 0 && text.length <= max ? text : null
}

/**
 * Client-side counterpart to the edge-function widget schemas. Persisted
 * widgets are untrusted generated data: only known renderer types and bounded
 * display fields may reach the dashboard surface.
 */
export function validateDashboardWidgetSpec(value: unknown): ValidatedDashboardWidgetSpec | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  const widgetType = raw.widget_type
  const title = boundedText(raw.title, MAX_TITLE_LENGTH)
  const description = raw.description == null ? null : boundedText(raw.description, MAX_DESCRIPTION_LENGTH)
  const insight = raw.insight == null ? null : boundedText(raw.insight, MAX_INSIGHT_LENGTH)

  if (typeof widgetType !== "string" || !getEnabledAnalyticsWidgetTypes().includes(widgetType as AdvancedWidgetType)) return null
  if (!title || (raw.description != null && !description) || (raw.insight != null && !insight)) return null

  return { widgetType: widgetType as AdvancedWidgetType, title, description, insight }
}

export function isRenderableDashboardWidget(value: unknown): boolean {
  return validateDashboardWidgetSpec(value) !== null
}
