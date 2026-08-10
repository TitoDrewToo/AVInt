import type { WidgetColor } from "@/lib/palette"
import { classifyRow } from "@/lib/document-classification"

export type TimeGrain = "monthly" | "weekly" | "daily"

export interface Widget {
  id: string
  type: string
  title: string
  isPremium?: boolean
  colors?: WidgetColor
  chartVariant?: string
  timeGrain?: TimeGrain
  currencyMode?: "split" | "merged"
  conversion_locked?: boolean
  advancedId?: string
  insight?: string
  rdConfig?: RdWidgetConfig
}

export interface RdWidgetConfig {
  source: "rd"
  angle: "cross_doc_correlation" | "raw_json_intelligence" | "anomaly_detection"
  chart_type: "line-chart" | "area-chart" | "bar-chart" | "pie-chart"
  data: Array<Record<string, unknown>>
  x_key: string
  data_key: string
  currency: string
}

export interface AdvancedWidget {
  id: string
  user_id: string
  widget_type: string
  title: string
  description: string | null
  insight: string | null
  config: Record<string, unknown> | null
  is_starred: boolean
  is_plotted: boolean
  created_at: string
  expires_at: string | null
}

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}

export interface KPIData {
  totalIncome: number
  totalExpenses: number
  netPosition: number
  savingsRate: number
  taxExposure: number
  taxRatio: number
  currency: string
}

export interface MonthlyData { month: string; expenses: number; income: number }
export interface CategoryData { name: string; value: number }
export interface StackedRow { month: string; [series: string]: string | number }
export interface BandedRow { month: string; actual: number; mean: number; upper: number; lower: number; bandWidth: number }
export interface ComposedRow { month: string; income: number; expenses: number; net: number }

export interface DashboardCurrencyBucket {
  currency: string
  totalIncome: number
  totalExpenses: number
  netPosition: number
  savingsRate: number
  taxExposure: number
  taxRatio: number
  monthlyData: MonthlyData[]
  categoryData: CategoryData[]
  stackedComposition: { rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }
  composedData: ComposedRow[]
  bandedData: BandedRow[]
  timeSeriesData: Record<TimeGrain, MonthlyData[]>
  stackedCompositionByGrain: Record<TimeGrain, { rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }>
  composedDataByGrain: Record<TimeGrain, ComposedRow[]>
  bandedDataByGrain: Record<TimeGrain, BandedRow[]>
}

export interface DashboardCurrencyModel {
  currencies: string[]
  primaryCurrency: string
  buckets: Record<string, DashboardCurrencyBucket>
  hasMultipleCurrencies: boolean
  unspecifiedRowCount: number
}

export const UNSPECIFIED_CURRENCY = "Unspecified"

export const TIME_GRAINS: TimeGrain[] = ["monthly", "weekly", "daily"]
export const TIME_GRAIN_LABEL: Record<TimeGrain, string> = {
  monthly: "Monthly",
  weekly: "Weekly",
  daily: "Daily",
}
export const TIME_GRAIN_UNIT: Record<TimeGrain, string> = {
  monthly: "month",
  weekly: "week",
  daily: "day",
}

export const DRILLABLE_WIDGET_TYPES = new Set([
  "area-chart",
  "line-chart",
  "stacked-bar",
  "composed-chart",
  "banded-area",
])

const MONEY_WIDGET_TYPES = new Set([
  "kpi-net",
  "kpi-tax-exposure",
  "kpi-tax-ratio",
  "area-chart",
  "line-chart",
  "bar-chart",
  "bar-deductible",
  "stacked-bar",
  "composed-chart",
  "banded-area",
])

export const EMPTY_CURRENCY_MODEL: DashboardCurrencyModel = {
  currencies: [],
  primaryCurrency: UNSPECIFIED_CURRENCY,
  buckets: {},
  hasMultipleCurrencies: false,
  unspecifiedRowCount: 0,
}

export const WIDGET_LIBRARY = [
  { type: "kpi-income", title: "Income KPI", desc: "Total income detected across all documents", isPremium: false },
  { type: "kpi-expenses", title: "Expenses KPI", desc: "Sum of all classified expense transactions", isPremium: false },
  { type: "kpi-net", title: "Net Position KPI", desc: "Income minus expenses with savings rate", isPremium: false },
  { type: "kpi-currency-summary", title: "All Currencies", desc: "Income, expenses, and net position for every currency in your data — native amounts, no conversion", isPremium: false },
  { type: "kpi-tax-exposure", title: "Tax Exposure KPI", desc: "Estimated tax liability based on net income", isPremium: false },
  { type: "kpi-tax-ratio", title: "Tax Burden Rate KPI", desc: "Tax as a percentage of gross income", isPremium: false },
  { type: "area-chart", title: "Income vs Expenses", desc: "Monthly trend of income and expenses over time", isPremium: false },
  { type: "bar-chart", title: "Category Breakdown", desc: "Total spending split by expense category", isPremium: false },
  { type: "bar-deductible", title: "Deductible Expenses", desc: "Categories that reduce your taxable income", isPremium: false },
  { type: "context-summary", title: "Context Summary", desc: "AI-generated financial narrative from your documents", isPremium: true },
]

export const CHART_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  "area-chart": [{ label: "Area", value: "area" }, { label: "Bar", value: "bar" }, { label: "Line", value: "line" }],
  "bar-chart": [{ label: "Bar", value: "bar" }, { label: "Pie", value: "pie" }],
  "bar-deductible": [{ label: "Bar", value: "bar" }, { label: "Pie", value: "pie" }],
  "pie-chart": [{ label: "Pie", value: "pie" }, { label: "Bar", value: "bar" }],
}

export const CHART_DEFAULT: Record<string, string> = {
  "area-chart": "area",
  "bar-chart": "bar",
  "bar-deductible": "bar",
  "pie-chart": "pie",
}

export function currencyToSymbol(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase()
  if (!c || c === UNSPECIFIED_CURRENCY.toUpperCase()) return ""
  if (c === "PHP") return "₱"
  if (c === "EUR") return "€"
  if (c === "GBP") return "£"
  if (c === "USD" || c === "AUD" || c === "CAD" || c === "SGD") return "$"
  if (c === "JPY") return "¥"
  return `${c} `
}

export function currencyDisplayName(code: string | null | undefined): string | null {
  const c = (code ?? "").trim()
  if (!c || c.toUpperCase() === UNSPECIFIED_CURRENCY.toUpperCase()) return null
  return c
}

function dateFromIso(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function isoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function timeBucketFor(dateValue: string, grain: TimeGrain): { key: string; label: string } {
  const date = dateFromIso(dateValue.slice(0, 10))
  if (grain === "daily") {
    return {
      key: dateValue.slice(0, 10),
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }
  }

  if (grain === "weekly") {
    const day = date.getDay() === 0 ? 7 : date.getDay()
    const monday = new Date(date)
    monday.setDate(date.getDate() - day + 1)
    return {
      key: isoDate(monday),
      label: monday.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    }
  }

  const key = dateValue.slice(0, 7)
  return {
    key,
    label: dateFromIso(`${key}-01`).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
  }
}

export function nextTimeGrain(grain: TimeGrain | undefined): TimeGrain {
  if (grain === "weekly") return "daily"
  if (grain === "daily") return "monthly"
  return "weekly"
}

function dashboardAmount(row: any, safeNum: (v: unknown) => number): number {
  return classifyRow(row) === "income"
    ? safeNum(row.gross_income ?? row.total_amount)
    : safeNum(row.total_amount)
}

function computeBucket(cur: string, rows: any[], safeNum: (v: unknown) => number): DashboardCurrencyBucket {
  const incomeRows = rows.filter((f) => classifyRow(f) === "income")
  const expenseRows = rows.filter((f) => classifyRow(f) === "expense")
  const totalIncome = incomeRows.reduce((s, f) => s + safeNum(f.gross_income ?? f.total_amount), 0)
  const totalExpenses = expenseRows.reduce((s, f) => s + safeNum(f.total_amount), 0)
  const netPosition = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netPosition / totalIncome) * 100 : 0
  const taxExposure = Math.max(0, netPosition)
  const taxRatio = totalIncome > 0 ? (taxExposure / totalIncome) * 100 : 0

  const timeMaps: Record<TimeGrain, Record<string, { label: string; expenses: number; income: number }>> = {
    monthly: {},
    weekly: {},
    daily: {},
  }
  rows.forEach((f) => {
    const classification = classifyRow(f)
    if (!f.document_date || !classification) return
    const amount = classification === "income"
      ? safeNum(f.gross_income ?? f.total_amount)
      : safeNum(f.total_amount)
    for (const grain of TIME_GRAINS) {
      const bucket = timeBucketFor(f.document_date, grain)
      if (!timeMaps[grain][bucket.key]) timeMaps[grain][bucket.key] = { label: bucket.label, expenses: 0, income: 0 }
      if (classification === "income") timeMaps[grain][bucket.key].income += amount
      else timeMaps[grain][bucket.key].expenses += amount
    }
  })
  const timeSeriesData = Object.fromEntries(
    TIME_GRAINS.map((grain) => [
      grain,
      Object.entries(timeMaps[grain])
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, d]) => ({ month: d.label, expenses: d.expenses, income: d.income })),
    ]),
  ) as Record<TimeGrain, MonthlyData[]>
  const monthlyData = timeSeriesData.monthly

  const catMap: Record<string, number> = {}
  expenseRows.forEach((f) => {
    const cat = f.expense_category ?? "Other"
    catMap[cat] = (catMap[cat] ?? 0) + safeNum(f.total_amount)
  })
  const categoryData: CategoryData[] = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }))

  const composedDataByGrain = Object.fromEntries(
    TIME_GRAINS.map((grain) => [
      grain,
      timeSeriesData[grain].map((d) => ({
        month: d.month,
        income: d.income,
        expenses: d.expenses,
        net: d.income - d.expenses,
      })),
    ]),
  ) as Record<TimeGrain, ComposedRow[]>
  const composedData = composedDataByGrain.monthly

  const expenseWithDomain = expenseRows.filter((f) => f.merchant_domain).length
  const groupBy: "merchant_domain" | "expense_category" =
    expenseRows.length > 0 && expenseWithDomain / expenseRows.length >= 0.5
      ? "merchant_domain"
      : "expense_category"
  const seriesTotals: Record<string, number> = {}
  expenseRows.forEach((f) => {
    const series = String(f[groupBy] ?? "Other")
    const amt = safeNum(f.total_amount)
    seriesTotals[series] = (seriesTotals[series] ?? 0) + amt
  })
  const topSeries = Object.entries(seriesTotals).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name)
  const topSet = new Set(topSeries)
  const hasTail = Object.keys(seriesTotals).some((s) => !topSet.has(s))
  const finalSeries = hasTail ? [...topSeries, "Other"] : topSeries
  const stackedCompositionByGrain = Object.fromEntries(
    TIME_GRAINS.map((grain) => {
      const stackedMap: Record<string, { label: string; values: Record<string, number> }> = {}
      expenseRows.forEach((f) => {
        if (!f.document_date) return
        const bucket = timeBucketFor(f.document_date, grain)
        const series = String(f[groupBy] ?? "Other")
        if (!stackedMap[bucket.key]) stackedMap[bucket.key] = { label: bucket.label, values: {} }
        const amt = safeNum(f.total_amount)
        stackedMap[bucket.key].values[series] = (stackedMap[bucket.key].values[series] ?? 0) + amt
      })
      const rows = Object.entries(stackedMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, perSeries]) => {
          const row: StackedRow = { month: perSeries.label }
          for (const s of finalSeries) row[s] = 0
          for (const [s, v] of Object.entries(perSeries.values)) {
            const bucket = topSet.has(s) ? s : "Other"
            row[bucket] = Number(row[bucket] ?? 0) + v
          }
          return row
        })
      return [grain, { rows, seriesKeys: finalSeries, groupBy }]
    }),
  ) as Record<TimeGrain, { rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }>
  const stackedComposition = stackedCompositionByGrain.monthly

  const bandedDataByGrain = Object.fromEntries(
    TIME_GRAINS.map((grain) => {
      const spendSeries = timeSeriesData[grain].map((d) => ({ month: d.month, actual: d.expenses }))
      return [grain, spendSeries.map((row, i) => {
        const windowStart = Math.max(0, i - 2)
        const window = spendSeries.slice(windowStart, i + 1).map((r) => r.actual)
        const mean = window.reduce((s, v) => s + v, 0) / window.length
        const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length
        const sigma = Math.sqrt(variance)
        const upper = mean + sigma
        const lower = Math.max(0, mean - sigma)
        return {
          month: row.month,
          actual: row.actual,
          mean,
          upper,
          lower,
          bandWidth: Math.max(0, upper - lower),
        }
      })]
    }),
  ) as Record<TimeGrain, BandedRow[]>
  const bandedData = bandedDataByGrain.monthly

  return {
    currency: cur,
    totalIncome,
    totalExpenses,
    netPosition,
    savingsRate,
    taxExposure,
    taxRatio,
    monthlyData,
    categoryData,
    stackedComposition,
    composedData,
    bandedData,
    timeSeriesData,
    stackedCompositionByGrain,
    composedDataByGrain,
    bandedDataByGrain,
  }
}

export function buildCurrencyModel(fields: any[], safeNum: (v: unknown) => number, preferredCurrency?: string | null): DashboardCurrencyModel {
  if (!fields?.length) return EMPTY_CURRENCY_MODEL

  const labeled: Record<string, any[]> = {}
  let unspecifiedRowCount = 0
  for (const f of fields) {
    const classification = classifyRow(f)
    const amount = classification === "income"
      ? (f.gross_income ?? f.total_amount)
      : f.total_amount
    if (!classification || amount === null || amount === undefined) continue
    const raw = typeof f?.currency === "string" ? f.currency.trim().toUpperCase() : ""
    const currency = raw || UNSPECIFIED_CURRENCY
    if (currency === UNSPECIFIED_CURRENCY) unspecifiedRowCount++
    ;(labeled[currency] ??= []).push(f)
  }

  const buckets: Record<string, DashboardCurrencyBucket> = {}
  for (const [cur, rows] of Object.entries(labeled)) {
    buckets[cur] = computeBucket(cur, rows, safeNum)
  }
  const currencies = Object.keys(buckets).filter((currency) => currency !== UNSPECIFIED_CURRENCY)

  const stats: Record<string, { count: number; activity: number; latest: string }> = {}
  for (const [cur, rows] of Object.entries(labeled)) {
    let activity = 0
    let latest = ""
    for (const r of rows) {
      activity += dashboardAmount(r, safeNum)
      if (typeof r?.document_date === "string" && r.document_date > latest) latest = r.document_date
    }
    stats[cur] = { count: rows.length, activity, latest }
  }

  const normalizedPreference = preferredCurrency?.trim() || ""
  const inferredPrimary = [...currencies].sort((a, b) =>
    stats[b].count - stats[a].count ||
    stats[b].activity - stats[a].activity ||
    stats[b].latest.localeCompare(stats[a].latest),
  )[0] ?? UNSPECIFIED_CURRENCY
  const primary = normalizedPreference && currencies.includes(normalizedPreference)
    ? normalizedPreference
    : inferredPrimary
  const orderedCurrencies = currencies.length === 0 ? [] : [
    primary,
    ...currencies
      .filter((cur) => cur !== primary)
      .sort((a, b) =>
        stats[b].count - stats[a].count ||
        stats[b].activity - stats[a].activity ||
        stats[b].latest.localeCompare(stats[a].latest),
      ),
  ]

  return {
    currencies: orderedCurrencies,
    primaryCurrency: primary,
    buckets,
    hasMultipleCurrencies: currencies.length > 1,
    unspecifiedRowCount,
  }
}

export function displayWidgetTitle(widget: Widget, model: DashboardCurrencyModel): string {
  if (!model.hasMultipleCurrencies) return widget.title
  const displayCurrency = currencyDisplayName(model.primaryCurrency)
  if (MONEY_WIDGET_TYPES.has(widget.type) && displayCurrency) return `${widget.title} · ${displayCurrency}`
  return widget.title
}

export function emptyTimeSeries(): Record<TimeGrain, MonthlyData[]> {
  return { monthly: [], weekly: [], daily: [] }
}

export function emptyComposedSeries(): Record<TimeGrain, ComposedRow[]> {
  return { monthly: [], weekly: [], daily: [] }
}

export function emptyBandedSeries(): Record<TimeGrain, BandedRow[]> {
  return { monthly: [], weekly: [], daily: [] }
}

export function emptyStackedSeries(): Record<TimeGrain, { rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }> {
  return {
    monthly: { rows: [], seriesKeys: [], groupBy: "expense_category" },
    weekly: { rows: [], seriesKeys: [], groupBy: "expense_category" },
    daily: { rows: [], seriesKeys: [], groupBy: "expense_category" },
  }
}
