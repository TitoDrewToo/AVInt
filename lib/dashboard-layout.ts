export interface DashboardLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}

export interface DashboardWidgetLike {
  type?: string | null
  advancedId?: string
}

export const CHART_WIDGET_TYPES = new Set([
  "area-chart",
  "bar-chart",
  "bar-deductible",
  "line-chart",
  "pie-chart",
  "stacked-bar",
  "composed-chart",
  "banded-area",
])

export const WIDGET_MIN_SIZE: Record<string, { minW: number; minH: number }> = {
  "kpi-income":       { minW: 2, minH: 1 },
  "kpi-expenses":     { minW: 2, minH: 1 },
  "kpi-net":          { minW: 2, minH: 1 },
  "kpi-tax-exposure": { minW: 2, minH: 1 },
  "kpi-tax-ratio":    { minW: 2, minH: 1 },
  "kpi-savings":      { minW: 2, minH: 1 },
  "kpi-tax":          { minW: 2, minH: 1 },
  "bar-chart":        { minW: 3, minH: 2 },
  "bar-deductible":   { minW: 3, minH: 2 },
  "line-chart":       { minW: 3, minH: 2 },
  "area-chart":       { minW: 3, minH: 2 },
  "pie-chart":        { minW: 2, minH: 2 },
  "context-summary":  { minW: 3, minH: 3 },
  "rd-insight":       { minW: 3, minH: 3 },
  "stacked-bar":      { minW: 3, minH: 2 },
  "composed-chart":   { minW: 3, minH: 2 },
  "banded-area":      { minW: 3, minH: 2 },
}

export function widgetMinSize(type?: string | null): { minW: number; minH: number } {
  return (type && WIDGET_MIN_SIZE[type]) || { minW: 2, minH: 2 }
}

export function compactStaleWidgetSize<T extends DashboardLayoutItem>(
  item: T,
  widget?: DashboardWidgetLike,
): T {
  const widgetType = widget?.type ?? item.i
  const minSize = widgetMinSize(widgetType)
  const isKpi = widgetType.startsWith("kpi")
  const isChart = CHART_WIDGET_TYPES.has(widgetType)
  const wasOldGeneratedKpi = isKpi && (((item.w === 2 || item.w === 3) && item.h === 2) || (item.w === 3 && item.h === 4) || item.h === 5)
  const wasOldGeneratedChart = !isKpi && item.w === 6 && item.h === 8
  const wasOldDefaultChart = !isKpi && ((item.w === 12 && item.h === 12) || (item.w === 4 && item.h === 11))
  const wasPreviousChartMinimum = isChart && item.h === 3 && minSize.minH === 2
  const wasOldGeneratedAdvanced = Boolean(widget?.advancedId) && item.w === minSize.minW + 2 && item.h === minSize.minH + 2
  const shouldCompact = wasOldGeneratedKpi || wasOldGeneratedChart || wasOldDefaultChart || wasPreviousChartMinimum || wasOldGeneratedAdvanced

  return {
    ...item,
    w: shouldCompact ? minSize.minW : Math.max(item.w, minSize.minW),
    h: shouldCompact ? minSize.minH : Math.max(item.h, minSize.minH),
    minW: minSize.minW,
    minH: minSize.minH,
  }
}

// Translates a saved 12-col desktop layout into a mobile-friendly 12-col layout.
// Never persisted — computed at render time so desktop config is untouched.
export function toMobileLayout<T extends DashboardLayoutItem>(desktopLayout: T[]): T[] {
  const mobileCols = 12
  const half = 6
  const sorted = [...desktopLayout].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  const mobile: T[] = []
  let curX = 0
  let curY = 0
  let rowH = 0

  for (const item of sorted) {
    const mw = item.w <= 2 ? half : mobileCols
    const mh = item.h

    if (curX + mw > mobileCols) {
      curY += rowH
      curX = 0
      rowH = 0
    }

    mobile.push({ ...item, x: curX, y: curY, w: mw, h: mh, static: true })
    curX += mw
    rowH = Math.max(rowH, mh)
  }

  return mobile
}
