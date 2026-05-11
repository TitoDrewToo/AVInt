import { z } from "./deps.ts"

const boundedTitle = z.string().trim().min(1).max(120)
const boundedDescription = z.string().trim().min(1).max(500)
const boundedInsight = z.string().trim().min(1).max(800)

export const WidgetTypeSchema = z.enum([
  "line-chart",
  "area-chart",
  "bar-chart",
  "pie-chart",
  "stacked-bar",
  "composed-chart",
  "banded-area",
  "rd-insight",
])

export const HaikuWidgetTypeSchema = z.enum([
  "line-chart",
  "area-chart",
  "bar-chart",
  "pie-chart",
  "stacked-bar",
  "composed-chart",
  "banded-area",
])

export const AdvancedChartFamilySchema = z.enum([
  "time_series_simple",
  "composition_simple",
  "comparison_multi_metric",
  "time_series_composed",
  "time_series_banded",
  "composition_stacked",
])

export const RdAngleSchema = z.enum([
  "cross_doc_correlation",
  "raw_json_intelligence",
  "anomaly_detection",
])

export const RdChartTypeSchema = z.enum([
  "line-chart",
  "area-chart",
  "bar-chart",
  "pie-chart",
])

export const RdWidgetConfigSchema = z.object({
  source: z.literal("rd"),
  angle: RdAngleSchema,
  chart_type: RdChartTypeSchema,
  data: z.array(z.record(z.unknown())),
  x_key: z.string(),
  data_key: z.string(),
  currency: z.string(),
}).strict()

export const HaikuSpecWidgetOutputSchema = z.object({
  widget_type: HaikuWidgetTypeSchema,
  chart_family: AdvancedChartFamilySchema,
  title: boundedTitle,
  description: boundedDescription,
  insight: boundedInsight,
}).strict()

export const HaikuSpecOutputSchema = z.object({
  widgets: z.array(HaikuSpecWidgetOutputSchema),
})

export const SonnetRdWidgetOutputSchema = z.object({
  angle: RdAngleSchema,
  chart_type: RdChartTypeSchema,
  title: boundedTitle,
  description: boundedDescription,
  insight: boundedInsight,
  data: z.array(z.record(z.unknown())).min(3).max(24),
  x_key: z.string().trim().min(1),
  data_key: z.string().trim().min(1),
}).strict().superRefine((widget, ctx) => {
  widget.data.forEach((row, index) => {
    if (row[widget.x_key] == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", index, widget.x_key],
        message: "x_key must be present in every data row",
      })
    }

    const value = row[widget.data_key]
    if (typeof value !== "number" || !Number.isFinite(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["data", index, widget.data_key],
        message: "data_key must be a finite number in every data row",
      })
    }
  })
})

export const SonnetRdOutputSchema = z.object({
  widgets: z.array(SonnetRdWidgetOutputSchema),
})

export function payloadSampleForLog(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.slice(0, 200)
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value
  if (depth >= 3) return "[truncated]"

  if (Array.isArray(value)) {
    const sample = value.slice(0, 5).map((item) => payloadSampleForLog(item, depth + 1))
    if (value.length > 5) sample.push(`[${value.length - 5} more items omitted]`)
    return sample
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 12)
    const sample: Record<string, unknown> = {}
    for (const [key, item] of entries) sample[key] = payloadSampleForLog(item, depth + 1)
    const remaining = Object.keys(value as Record<string, unknown>).length - entries.length
    if (remaining > 0) sample.__omitted_keys = remaining
    return sample
  }

  return String(value).slice(0, 200)
}
