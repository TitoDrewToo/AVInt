import { validateDashboardWidgetSpec } from "@/lib/dashboard-widget-spec"

export type DashboardAssistantProposal = {
  widget_type: "line-chart" | "area-chart" | "bar-chart" | "pie-chart"
  title: string
  description: string | null
  insight: string | null
  definition: NonNullable<NonNullable<ReturnType<typeof validateDashboardWidgetSpec>>["definition"]>
}

export type DashboardAssistantModelResult =
  | { mode: "answer"; answer: string; proposal: null }
  | { mode: "visual"; answer: string; proposal: DashboardAssistantProposal }

function boundedText(value: unknown, maximum: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text && text.length <= maximum ? text : null
}

/**
 * Treat provider output as untrusted. Only a concise answer or a complete,
 * canonical visual definition can cross into the dashboard execution layer.
 */
export function validateDashboardAssistantModelResult(value: unknown): DashboardAssistantModelResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const answer = boundedText(raw.answer, 2_000)
  if (!answer) return null
  if (raw.mode === "answer") return { mode: "answer", answer, proposal: null }
  if (raw.mode !== "visual") return null
  const validated = validateDashboardWidgetSpec(raw.proposal)
  if (!validated?.definition || !["line-chart", "area-chart", "bar-chart", "pie-chart"].includes(validated.widgetType)) return null
  if (validated.definition.renderer !== validated.widgetType) return null
  return {
    mode: "visual",
    answer,
    proposal: {
      widget_type: validated.widgetType as DashboardAssistantProposal["widget_type"],
      title: validated.title,
      description: validated.description,
      insight: validated.insight,
      definition: validated.definition,
    },
  }
}

export function fallbackDashboardAssistantResult(question: string, readyRecordCount: number, sourceCount: number, dateFrom?: string | null, dateTo?: string | null): DashboardAssistantModelResult {
  const wantsVisual = /\b(chart|graph|plot|visual|visuali[sz]e|show me)\b/i.test(question)
  if (wantsVisual) {
    return {
      mode: "visual",
      answer: "I prepared a refreshable view of your current records by document type. Review the preview before adding it to this page.",
      proposal: {
        widget_type: "bar-chart",
        title: "Records by document type",
        description: "Current normalized records grouped by document type.",
        insight: null,
        definition: {
          renderer: "bar-chart",
          source: { kind: "records" },
          scope: null,
          period: dateFrom && dateTo ? { kind: "fixed", from: dateFrom, to: dateTo } : { kind: "all" },
          filters: [],
          dimension: { field: "document_type" },
          metric: { aggregation: "count" },
          limit: 12,
        },
      },
    }
  }
  return {
    mode: "answer",
    answer: readyRecordCount > 0
      ? `Your dashboard can currently work from ${readyRecordCount} normalized records across ${sourceCount} source files. Connect an assistant provider for request-specific analysis and visual authoring.`
      : "There are no normalized records available for dashboard analysis yet.",
    proposal: null,
  }
}
