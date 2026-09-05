import { supabaseAdmin } from "@/lib/mcp-auth"
import { widgetMinSize } from "@/lib/dashboard-layout"
import { validateDashboardWidgetSpec } from "@/lib/dashboard-widget-spec"
import { executeDashboardVisual } from "@/lib/dashboard-visual-engine"
import { resolveDashboardPage } from "@/lib/dashboard-pages"

export async function listSavedDashboardWidgets(userId: string, pageSlug?: string, resolvedPageId?: string) {
  const page = pageSlug && !resolvedPageId ? await resolveDashboardPage(userId, pageSlug) : null
  const pageId = resolvedPageId ?? page?.id
  let query = supabaseAdmin.from("advanced_widgets").select("id, page_id, widget_type, title, description, insight, config, is_starred, is_plotted, created_at").eq("user_id", userId).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order("created_at", { ascending: false }).limit(100)
  if (pageId) query = query.eq("page_id", pageId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return Promise.all((data ?? []).filter((row) => validateDashboardWidgetSpec(row) !== null).map(async (row) => {
    const validated = validateDashboardWidgetSpec(row)
    if (!validated?.definition) return row
    try {
      return { ...row, resolved_config: await executeDashboardVisual(userId, validated.definition) }
    } catch {
      return { ...row, resolution_error: "This visual cannot be refreshed from its current data source." }
    }
  }))
}

export async function saveDashboardWidget(userId: string, input: unknown, plot = true, pageSlug?: string) {
  const validated = validateDashboardWidgetSpec(input)
  if (!validated) throw new TypeError("Widget must use an enabled chart type and bounded title, description, and insight")
  if (!validated.definition) throw new TypeError("A canonical visual definition is required")
  if (validated.definition.renderer !== validated.widgetType) throw new TypeError("Visual renderer must match widget_type")
  const [page, resolved] = await Promise.all([resolveDashboardPage(userId, pageSlug), executeDashboardVisual(userId, validated.definition)])
  const { data: saved, error } = await supabaseAdmin.from("advanced_widgets").insert({
    user_id: userId,
    page_id: page.id,
    widget_type: validated.widgetType,
    title: validated.title,
    description: validated.description,
    insight: validated.insight,
    config: { source: "definition", definition: validated.definition },
    is_starred: true,
    is_plotted: plot,
    expires_at: null,
  }).select("*").single()
  if (error || !saved) throw new Error(error?.message ?? "Dashboard visual could not be saved")
  if (!plot) return { ...saved, resolved_config: resolved }

  const current = page
  const layout = current?.layout && typeof current.layout === "object" && !Array.isArray(current.layout) ? current.layout as Record<string, unknown> : {}
  const widgets = Array.isArray(layout.widgets) ? layout.widgets.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : []
  const gridLayout = Array.isArray(layout.gridLayout) ? layout.gridLayout.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>> : []
  const widgetId = `adv-${saved.id}`
  if (!widgets.some((widget) => widget.advancedId === saved.id)) {
    widgets.push({ id: widgetId, type: validated.widgetType, title: validated.title, isPremium: true, advancedId: saved.id, visualConfig: resolved, ...(validated.insight ? { insight: validated.insight } : {}) })
    const min = widgetMinSize(validated.widgetType)
    const lastY = gridLayout.reduce((maximum, item) => Math.max(maximum, Number(item.y ?? 0) + Number(item.h ?? 0)), 0)
    gridLayout.push({ i: widgetId, x: 0, y: lastY, w: min.minW, h: min.minH, minW: min.minW, minH: min.minH })
  }
  const { error: saveError } = await supabaseAdmin.from("dashboard_pages").update({ layout: { ...layout, widgets, gridLayout }, updated_at: new Date().toISOString() }).eq("id", page.id).eq("user_id", userId)
  if (saveError) {
    await supabaseAdmin.from("advanced_widgets").update({ is_plotted: false }).eq("id", saved.id).eq("user_id", userId)
    throw new Error(`Visual was saved but could not be plotted: ${saveError.message}`)
  }
  return { ...saved, resolved_config: resolved }
}
