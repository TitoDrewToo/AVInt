import type { Widget } from "@/lib/smart-dashboard"

export type WidgetCurrencyMode = "split" | "merged"

export type DashboardPreferences = {
  primaryCurrency: string | null
  widgetCurrencyModes: Record<string, WidgetCurrencyMode>
}

export function normalizeWidgetCurrencyMode(value: unknown): WidgetCurrencyMode | undefined {
  if (value === "merged") return "merged"
  if (value === "split" || value === "stacked") return "split"
  return undefined
}

export function widgetCurrencyModesFor(widgets: Widget[]) {
  const modes: Record<string, WidgetCurrencyMode> = {}
  for (const widget of widgets) {
    const mode = normalizeWidgetCurrencyMode(widget.currencyMode)
    if (mode) modes[widget.id] = mode
  }
  return modes
}

export function normalizeDashboardPreferences(value: unknown): DashboardPreferences {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {}
  const rawModes = source.widgetCurrencyModes && typeof source.widgetCurrencyModes === "object"
    ? source.widgetCurrencyModes as Record<string, unknown>
    : {}
  const widgetCurrencyModes: Record<string, WidgetCurrencyMode> = {}

  for (const [widgetId, rawMode] of Object.entries(rawModes)) {
    const mode = normalizeWidgetCurrencyMode(rawMode)
    if (mode) widgetCurrencyModes[widgetId] = mode
  }

  return {
    primaryCurrency: typeof source.primaryCurrency === "string" ? source.primaryCurrency : null,
    widgetCurrencyModes,
  }
}

export function applyWidgetCurrencyModes(widgets: Widget[], modes: Record<string, unknown>) {
  return widgets.map((widget) => {
    const mode = normalizeWidgetCurrencyMode(modes[widget.id])
    return mode ? { ...widget, currencyMode: mode } : widget
  })
}
