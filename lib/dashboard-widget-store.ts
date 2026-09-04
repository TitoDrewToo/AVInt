import { supabaseAdmin } from "@/lib/mcp-auth"
import { widgetMinSize } from "@/lib/dashboard-layout"
import { validateDashboardWidgetSpec } from "@/lib/dashboard-widget-spec"

export async function listSavedDashboardWidgets(userId: string) {
  const { data, error } = await supabaseAdmin.from("advanced_widgets").select("id, widget_type, title, description, insight, config, is_starred, is_plotted, created_at").eq("user_id", userId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).filter((row) => validateDashboardWidgetSpec(row) !== null)
}

export async function saveDashboardWidget(userId: string, input: unknown, plot = true) {
  const validated = validateDashboardWidgetSpec(input)
  if (!validated) throw new TypeError("Widget must use an enabled chart type and bounded title, description, and insight")
  const { data: saved, error } = await supabaseAdmin.from("advanced_widgets").insert({
    user_id: userId,
    widget_type: validated.widgetType,
    title: validated.title,
    description: validated.description,
    insight: validated.insight,
    config: { source: "mcp" },
    is_starred: true,
    is_plotted: plot,
    expires_at: null,
  }).select("*").single()
  if (error || !saved) throw new Error(error?.message ?? "Dashboard visual could not be saved")
  if (!plot) return saved

  const { data: current, error: layoutError } = await supabaseAdmin.from("dashboard_layouts").select("layout").eq("user_id", userId).maybeSingle()
  if (layoutError) throw new Error(layoutError.message)
  const layout = current?.layout && typeof current.layout === "object" && !Array.isArray(current.layout) ? current.layout as Record<string, unknown> : {}
  const widgets = Array.isArray(layout.widgets) ? layout.widgets.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : []
  const gridLayout = Array.isArray(layout.gridLayout) ? layout.gridLayout.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : []
  const widgetId = `adv-${saved.id}`
  if (!widgets.some((widget) => widget.advancedId === saved.id)) {
    widgets.push({ id: widgetId, type: validated.widgetType, title: validated.title, isPremium: true, advancedId: saved.id, ...(validated.insight ? { insight: validated.insight } : {}) })
    const min = widgetMinSize(validated.widgetType)
    const lastY = gridLayout.reduce((maximum, item) => Math.max(maximum, Number(item.y ?? 0) + Number(item.h ?? 0)), 0)
    gridLayout.push({ i: widgetId, x: 0, y: lastY, w: min.minW, h: min.minH, minW: min.minW, minH: min.minH })
  }
  const { error: saveError } = await supabaseAdmin.from("dashboard_layouts").upsert({ user_id: userId, layout: { ...layout, widgets, gridLayout }, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (saveError) {
    await supabaseAdmin.from("advanced_widgets").update({ is_plotted: false }).eq("id", saved.id).eq("user_id", userId)
    throw new Error(`Visual was saved but could not be plotted: ${saveError.message}`)
  }
  return saved
}
