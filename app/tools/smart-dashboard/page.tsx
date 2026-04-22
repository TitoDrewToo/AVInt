"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useTheme } from "next-themes"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import {
  computeCorpusSignature,
  evaluateReadiness,
  normalizeSignature,
  describeUnlockHint,
  type CorpusSignature,
  type ReadinessState,
} from "@/lib/analytics-readiness"
import type { Session } from "@supabase/supabase-js"
import GridLayoutBase, { Layout as RGLLayout } from "react-grid-layout"
// react-grid-layout v2 changed its TS prop types — cast to any to keep v1-style props working at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const GridLayout = GridLayoutBase as any
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, Sector,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, Receipt, Wallet, FileText,
  Save, Calendar, ChevronDown, ChevronRight, Lock, Sparkles,
  LayoutGrid, X, Check, Plus, Zap, PanelRight, Star
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"

import {
  CURATED_ACCENTS,
  DEFAULT_ACCENT,
  derivePalette,
  extendPalette,
  type ThemeMode,
  type WidgetColor,
} from "@/lib/palette"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Widget {
  id: string
  type: string
  title: string
  isPremium?: boolean
  colors?: WidgetColor
  chartVariant?: string
  advancedId?: string   // references advanced_widgets.id
  insight?: string      // AI-generated insight text
  rdConfig?: RdWidgetConfig
}

// Sonnet-produced widget payload. When present, the renderer uses config.data
// directly instead of re-deriving from the dashboard's monthly/category series.
interface RdWidgetConfig {
  source: "rd"
  angle: "cross_doc_correlation" | "raw_json_intelligence" | "anomaly_detection"
  chart_type: "line-chart" | "area-chart" | "bar-chart" | "pie-chart"
  data: Array<Record<string, unknown>>
  x_key: string
  data_key: string
  currency: string
}

interface AdvancedWidget {
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

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  static?: boolean
}

interface KPIData {
  totalIncome: number
  totalExpenses: number
  netPosition: number
  savingsRate: number
  taxExposure: number
  taxRatio: number
  currency: string
}

interface MonthlyData { month: string; expenses: number; income: number }
interface CategoryData { name: string; value: number }

// Row in the stacked-bar data set: one entry per month, one numeric key per
// series (merchant_domain or expense_category) plus "Other" for the long tail.
interface StackedRow { month: string; [series: string]: string | number }

// Monthly actual spend against a 3-month trailing mean ± 1σ band. `upper` and
// `lower` are absolute values used by Recharts' Area layers to draw the band.
interface BandedRow { month: string; actual: number; mean: number; upper: number; lower: number; bandWidth: number }

// One composed row carries income (line), expenses (bar), net (area).
interface ComposedRow { month: string; income: number; expenses: number; net: number }

// ── Multi-currency model ──────────────────────────────────────────────────────
//
// Money totals must never cross currencies. Documents are bucketed by their
// own `currency` column and every monetary aggregation is computed per bucket.
// Count-based views (document distribution) stay global — they don't sum money.

interface DashboardCurrencyBucket {
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
}

interface DashboardCurrencyModel {
  currencies: string[]
  primaryCurrency: string
  buckets: Record<string, DashboardCurrencyBucket>
  hasMultipleCurrencies: boolean
  convertedBucket?: DashboardCurrencyBucket | null
  fx?: {
    source: string
    date: string | null
    missingCurrencies: string[]
  } | null
}

// Money widgets that must be suffixed with the primary currency label when
// multiple currencies exist. Count-based views (pie-chart = Document
// Distribution) are absent by design — they don't aggregate money.
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

const CONVERTED_WIDGET_TYPES = new Set([
  "kpi-income",
  "kpi-expenses",
  "kpi-net",
  "area-chart",
  "line-chart",
  "bar-chart",
  "stacked-bar",
  "composed-chart",
  "banded-area",
])

function currencyToSymbol(code: string | null | undefined): string {
  const c = (code ?? "").toUpperCase()
  if (c === "PHP") return "₱"
  if (c === "EUR") return "€"
  if (c === "GBP") return "£"
  return "$"
}

const EMPTY_CURRENCY_MODEL: DashboardCurrencyModel = {
  currencies: [],
  primaryCurrency: "USD",
  buckets: {},
  hasMultipleCurrencies: false,
  convertedBucket: null,
  fx: null,
}

function computeBucket(cur: string, rows: any[], safeNum: (v: unknown) => number): DashboardCurrencyBucket {
  const incomeRows = rows.filter((f) => f.files && ["payslip", "income_statement"].includes(f.files.document_type))
  const expenseRows = rows.filter((f) => f.files && ["receipt", "invoice"].includes(f.files.document_type))
  const totalIncome = incomeRows.reduce((s, f) => s + safeNum(f.gross_income ?? f.total_amount), 0)
  const totalExpenses = expenseRows.reduce((s, f) => s + safeNum(f.total_amount), 0)
  const netPosition = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netPosition / totalIncome) * 100 : 0
  const taxExposure = Math.max(0, netPosition)
  const taxRatio = totalIncome > 0 ? (taxExposure / totalIncome) * 100 : 0

  const monthMap: Record<string, { expenses: number; income: number }> = {}
  rows.forEach((f) => {
    if (!f.document_date || !f.files) return
    const month = f.document_date.slice(0, 7)
    if (!monthMap[month]) monthMap[month] = { expenses: 0, income: 0 }
    if (["payslip", "income_statement"].includes(f.files.document_type))
      monthMap[month].income += safeNum(f.gross_income ?? f.total_amount)
    else monthMap[month].expenses += safeNum(f.total_amount)
  })
  const monthlyData: MonthlyData[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, d]) => ({
      month: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ...d,
    }))

  const catMap: Record<string, number> = {}
  expenseRows.forEach((f) => {
    const cat = f.expense_category ?? "Other"
    catMap[cat] = (catMap[cat] ?? 0) + safeNum(f.total_amount)
  })
  const categoryData: CategoryData[] = Object.entries(catMap)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }))

  const composedData: ComposedRow[] = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, d]) => ({
      month: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      income: d.income,
      expenses: d.expenses,
      net: d.income - d.expenses,
    }))

  // Stacked composition — merchant_domain preferred when well-populated.
  const expenseWithDomain = expenseRows.filter((f) => f.merchant_domain).length
  const groupBy: "merchant_domain" | "expense_category" =
    expenseRows.length > 0 && expenseWithDomain / expenseRows.length >= 0.5
      ? "merchant_domain"
      : "expense_category"
  const stackedMap: Record<string, Record<string, number>> = {}
  const seriesTotals: Record<string, number> = {}
  expenseRows.forEach((f) => {
    if (!f.document_date) return
    const month = f.document_date.slice(0, 7)
    const series = String(f[groupBy] ?? "Other")
    if (!stackedMap[month]) stackedMap[month] = {}
    const amt = safeNum(f.total_amount)
    stackedMap[month][series] = (stackedMap[month][series] ?? 0) + amt
    seriesTotals[series] = (seriesTotals[series] ?? 0) + amt
  })
  const topSeries = Object.entries(seriesTotals).sort(([, a], [, b]) => b - a).slice(0, 5).map(([name]) => name)
  const topSet = new Set(topSeries)
  const hasTail = Object.keys(seriesTotals).some((s) => !topSet.has(s))
  const finalSeries = hasTail ? [...topSeries, "Other"] : topSeries
  const stackedRows: StackedRow[] = Object.entries(stackedMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, perSeries]) => {
      const row: StackedRow = {
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      }
      for (const s of finalSeries) row[s] = 0
      for (const [s, v] of Object.entries(perSeries)) {
        const bucket = topSet.has(s) ? s : "Other"
        row[bucket] = Number(row[bucket] ?? 0) + v
      }
      return row
    })

  // Banded — monthly spend vs 3-month trailing mean ± 1σ.
  const monthlySpendSeries = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, d]) => ({ month: m, actual: d.expenses }))
  const bandedData: BandedRow[] = monthlySpendSeries.map((row, i) => {
    const windowStart = Math.max(0, i - 2)
    const window = monthlySpendSeries.slice(windowStart, i + 1).map((r) => r.actual)
    const mean = window.reduce((s, v) => s + v, 0) / window.length
    const variance = window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length
    const sigma = Math.sqrt(variance)
    const upper = mean + sigma
    const lower = Math.max(0, mean - sigma)
    return {
      month: new Date(row.month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      actual: row.actual,
      mean,
      upper,
      lower,
      bandWidth: Math.max(0, upper - lower),
    }
  })

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
    stackedComposition: { rows: stackedRows, seriesKeys: finalSeries, groupBy },
    composedData,
    bandedData,
  }
}

// Bucket fields by currency. Rows without a currency label are folded into the
// labeled bucket with the highest absolute activity — never materialize a
// spurious "USD" bucket just because legacy rows lack the column. USD is only
// the fallback when no row in the corpus carries any currency signal at all.
function buildCurrencyModel(fields: any[], safeNum: (v: unknown) => number): DashboardCurrencyModel {
  if (!fields?.length) return EMPTY_CURRENCY_MODEL

  const labeled: Record<string, any[]> = {}
  const unlabeled: any[] = []
  for (const f of fields) {
    const raw = typeof f?.currency === "string" ? f.currency.trim().toUpperCase() : ""
    if (raw) (labeled[raw] ??= []).push(f)
    else unlabeled.push(f)
  }

  const haveLabels = Object.keys(labeled).length > 0
  if (!haveLabels) {
    labeled["USD"] = unlabeled
  } else if (unlabeled.length) {
    const activity: Record<string, number> = {}
    for (const [cur, rows] of Object.entries(labeled)) {
      let a = 0
      for (const r of rows) {
        const dt = r?.files?.document_type
        if (dt === "payslip" || dt === "income_statement") a += safeNum(r.gross_income ?? r.total_amount)
        else a += safeNum(r.total_amount)
      }
      activity[cur] = a
    }
    const dest = Object.entries(activity).sort(([, a], [, b]) => b - a)[0]?.[0] ?? Object.keys(labeled)[0]
    labeled[dest].push(...unlabeled)
  }

  const buckets: Record<string, DashboardCurrencyBucket> = {}
  for (const [cur, rows] of Object.entries(labeled)) {
    buckets[cur] = computeBucket(cur, rows, safeNum)
  }
  const currencies = Object.keys(buckets)

  // Primary currency: document count → activity volume → recency.
  let primary = currencies[0] ?? "USD"
  if (currencies.length > 1) {
    const stats: Record<string, { count: number; activity: number; latest: string }> = {}
    for (const [cur, rows] of Object.entries(labeled)) {
      let activity = 0
      let latest = ""
      for (const r of rows) {
        const dt = r?.files?.document_type
        if (dt === "payslip" || dt === "income_statement") activity += safeNum(r.gross_income ?? r.total_amount)
        else activity += safeNum(r.total_amount)
        if (typeof r?.document_date === "string" && r.document_date > latest) latest = r.document_date
      }
      stats[cur] = { count: rows.length, activity, latest }
    }
    primary = [...currencies].sort((a, b) =>
      stats[b].count - stats[a].count ||
      stats[b].activity - stats[a].activity ||
      stats[b].latest.localeCompare(stats[a].latest),
    )[0]
  }

  return {
    currencies,
    primaryCurrency: primary,
    buckets,
    hasMultipleCurrencies: currencies.length > 1,
    convertedBucket: null,
    fx: null,
  }
}

async function loadFxRates(base: string, quotes: string[]): Promise<{ source: string; date: string | null; rates: Record<string, number> } | null> {
  if (!quotes.length) return { source: "Frankfurter", date: null, rates: {} }
  try {
    const params = new URLSearchParams({ base, quotes: quotes.join(",") })
    const res = await fetch(`/api/fx/rates?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      source: data.source ?? "Frankfurter",
      date: data.date ?? null,
      rates: data.rates ?? {},
    }
  } catch {
    return null
  }
}

function convertMoney(value: unknown, sourceCurrency: string, primaryCurrency: string, rates: Record<string, number>, safeNum: (v: unknown) => number) {
  const amount = safeNum(value)
  if (sourceCurrency === primaryCurrency) return amount
  const rate = rates[sourceCurrency]
  if (!rate || rate <= 0) return null
  return amount / rate
}

function withConvertedCurrencyBucket(
  model: DashboardCurrencyModel,
  fields: any[],
  fx: { source: string; date: string | null; rates: Record<string, number> } | null,
  safeNum: (v: unknown) => number,
): DashboardCurrencyModel {
  if (!model.hasMultipleCurrencies || !fx) return model

  const missingCurrencies = model.currencies
    .filter((cur) => cur !== model.primaryCurrency)
    .filter((cur) => !fx.rates[cur])

  if (missingCurrencies.length) {
    return { ...model, fx: { source: fx.source, date: fx.date, missingCurrencies } }
  }

  const convertedRows = fields.map((row) => {
    const sourceCurrency = typeof row?.currency === "string" && row.currency.trim()
      ? row.currency.trim().toUpperCase()
      : model.primaryCurrency
    const converted = { ...row, currency: model.primaryCurrency }
    for (const key of ["total_amount", "gross_income", "net_income", "tax_amount", "discount_amount"]) {
      if (row[key] !== null && row[key] !== undefined) {
        const value = convertMoney(row[key], sourceCurrency, model.primaryCurrency, fx.rates, safeNum)
        converted[key] = value ?? row[key]
      }
    }
    return converted
  })

  return {
    ...model,
    convertedBucket: computeBucket(model.primaryCurrency, convertedRows, safeNum),
    fx: { source: fx.source, date: fx.date, missingCurrencies: [] },
  }
}

function displayWidgetTitle(widget: Widget, model: DashboardCurrencyModel): string {
  if (!model.hasMultipleCurrencies) return widget.title
  if (model.convertedBucket && CONVERTED_WIDGET_TYPES.has(widget.type)) {
    return `${widget.title} · converted to ${model.primaryCurrency}`
  }
  if (MONEY_WIDGET_TYPES.has(widget.type)) return `${widget.title} · ${model.primaryCurrency}`
  return widget.title
}

// ── Mobile layout derivation ──────────────────────────────────────────────────
// Translates a saved 12-col desktop layout into a mobile-friendly 12-col layout.
// Keeps cols=12 so containerWidth math is identical — only widget sizes change:
//   w ≤ 2 on desktop  →  w=6  (half screen, two per row)
//   w  > 2 on desktop  →  w=12 (full screen, one per row)
// Never persisted — computed at render time so desktop config is untouched.
function toMobileLayout(desktopLayout: LayoutItem[]): LayoutItem[] {
  const MOBILE_COLS = 12
  const HALF = 6

  // Sort by desktop reading order: top row first, then left to right
  const sorted = [...desktopLayout].sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x)

  const mobile: LayoutItem[] = []
  let curX = 0
  let curY = 0
  let rowH = 0

  for (const item of sorted) {
    const mw = item.w <= 2 ? HALF : MOBILE_COLS
    const mh = item.h

    // Wrap to next row if it won't fit
    if (curX + mw > MOBILE_COLS) {
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

const WIDGET_MIN_SIZE: Record<string, { minW: number; minH: number }> = {
  "kpi-income":      { minW: 2, minH: 1 },
  "kpi-expenses":    { minW: 2, minH: 1 },
  "kpi-net":         { minW: 2, minH: 1 },
  "kpi-tax-exposure":{ minW: 2, minH: 1 },
  "kpi-tax-ratio":   { minW: 2, minH: 1 },
  "kpi-savings":     { minW: 2, minH: 1 },
  "kpi-tax":         { minW: 2, minH: 1 },
  "bar-chart":       { minW: 3, minH: 3 },
  "bar-deductible":  { minW: 3, minH: 3 },
  "line-chart":      { minW: 3, minH: 3 },
  "area-chart":      { minW: 3, minH: 3 },
  "pie-chart":       { minW: 2, minH: 3 },
  "context-summary": { minW: 3, minH: 3 },
  "rd-insight":      { minW: 3, minH: 3 },
  "stacked-bar":     { minW: 3, minH: 3 },
  "composed-chart":  { minW: 3, minH: 3 },
  "banded-area":     { minW: 3, minH: 3 },
}

function widgetMinSize(type?: string | null): { minW: number; minH: number } {
  return (type && WIDGET_MIN_SIZE[type]) || { minW: 2, minH: 2 }
}

function compactStaleWidgetSize(item: LayoutItem, widget?: Widget): LayoutItem {
  const minSize = widgetMinSize(widget?.type ?? item.i)
  const isKpi = (widget?.type ?? item.i).startsWith("kpi")
  const wasOldGeneratedKpi = isKpi && (((item.w === 2 || item.w === 3) && item.h === 2) || (item.w === 3 && item.h === 4) || item.h === 5)
  const wasOldGeneratedChart = !isKpi && item.w === 6 && item.h === 8
  const wasOldDefaultChart = !isKpi && ((item.w === 12 && item.h === 12) || (item.w === 4 && item.h === 11))
  const wasOldGeneratedAdvanced = Boolean(widget?.advancedId) && item.w === minSize.minW + 2 && item.h === minSize.minH + 2
  const shouldCompact = wasOldGeneratedKpi || wasOldGeneratedChart || wasOldDefaultChart || wasOldGeneratedAdvanced

  return {
    ...item,
    w: shouldCompact ? minSize.minW : Math.max(item.w, minSize.minW),
    h: shouldCompact ? minSize.minH : Math.max(item.h, minSize.minH),
    minW: minSize.minW,
    minH: minSize.minH,
  }
}

const WIDGET_LIBRARY = [
  { type: "kpi-income",       title: "Income KPI",          desc: "Total income detected across all documents",           isPremium: false },
  { type: "kpi-expenses",     title: "Expenses KPI",        desc: "Sum of all classified expense transactions",           isPremium: false },
  { type: "kpi-net",          title: "Net Position KPI",    desc: "Income minus expenses with savings rate",              isPremium: false },
  { type: "kpi-tax-exposure", title: "Tax Exposure KPI",    desc: "Estimated tax liability based on net income",         isPremium: false },
  { type: "kpi-tax-ratio",    title: "Tax Burden Rate KPI", desc: "Tax as a percentage of gross income",                 isPremium: false },
  { type: "area-chart",       title: "Income vs Expenses",  desc: "Monthly trend of income and expenses over time",      isPremium: false },
  { type: "bar-chart",        title: "Category Breakdown",  desc: "Total spending split by expense category",            isPremium: false },
  { type: "bar-deductible",   title: "Deductible Expenses", desc: "Categories that reduce your taxable income",          isPremium: false },
  { type: "context-summary",  title: "Context Summary",     desc: "AI-generated financial narrative from your documents", isPremium: true  },
]

// ── Chart type options per widget ─────────────────────────────────────────────

const CHART_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
  "area-chart":     [{ label: "Area", value: "area" }, { label: "Bar", value: "bar" }, { label: "Line", value: "line" }],
  "bar-chart":      [{ label: "Bar",  value: "bar"  }, { label: "Pie", value: "pie" }],
  "bar-deductible": [{ label: "Bar",  value: "bar"  }, { label: "Pie", value: "pie" }],
  "pie-chart":      [{ label: "Pie",  value: "pie"  }, { label: "Bar", value: "bar" }],
}

const CHART_DEFAULT: Record<string, string> = {
  "area-chart": "area", "bar-chart": "bar", "bar-deductible": "bar", "pie-chart": "pie",
}

// ── Animated number ───────────────────────────────────────────────────────────

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const steps = 50
    const increment = value / steps
    let step = 0
    const timer = setInterval(() => {
      step++
      if (step >= steps) { setDisplay(value); clearInterval(timer) }
      else setDisplay(Math.floor(increment * step))
    }, 20)
    return () => clearInterval(timer)
  }, [value])
  return <span>{prefix}{display.toLocaleString()}</span>
}

// ── Categorical patterns ──────────────────────────────────────────────────────
// For pie/stacked-bar with >5 series, overlay SVG patterns on the base color
// so neighboring slices stay distinct even when palette colors are similar.
// Also helps colorblind users. First 5 cells stay solid (palette carries the
// identity); cells 5+ get dots / diag stripes / crosshatch / checker cycling.

function renderCategoricalDefs(widgetId: string, palette: string[], theme: ThemeMode, count: number) {
  const overlay = theme === "dark" ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.24)"
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        if (i < 5) return null
        const color = palette[i % palette.length]
        const patternId = `pat-${widgetId}-${i}`
        const kind = (i - 5) % 4
        return (
          <pattern key={patternId} id={patternId} patternUnits="userSpaceOnUse" width={8} height={8}>
            <rect width={8} height={8} fill={color} />
            {kind === 0 && <circle cx={4} cy={4} r={1.3} fill={overlay} />}
            {kind === 1 && <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" stroke={overlay} strokeWidth={1.2} fill="none" />}
            {kind === 2 && (
              <g stroke={overlay} strokeWidth={1.1} fill="none">
                <path d="M-2,2 l4,-4 M0,8 l8,-8 M6,10 l4,-4" />
                <path d="M-2,6 l4,4 M0,0 l8,8 M6,-2 l4,4" />
              </g>
            )}
            {kind === 3 && (
              <g fill={overlay}>
                <rect x={0} y={0} width={4} height={4} />
                <rect x={4} y={4} width={4} height={4} />
              </g>
            )}
          </pattern>
        )
      })}
    </>
  )
}

function categoricalFillFor(widgetId: string, palette: string[], i: number): string {
  if (i < 5) return palette[i % palette.length]
  return `url(#pat-${widgetId}-${i})`
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, symbol }: any) {
  if (!active || !payload?.length) return null
  // Filter band helpers (unnamed series like "lower" from banded-area) so
  // they don't surface as rows with no label.
  const visible = payload.filter((e: any) =>
    (e.name || e.dataKey) && typeof e.value === "number" && !Number.isNaN(e.value),
  )
  if (!visible.length) return null
  // Row total for % share when the chart passes multiple numeric series
  // (stacked, grouped, multi-metric). Pie slices use entry.percent instead.
  const rowTotal = visible.reduce((s: number, e: any) => s + Math.abs(Number(e.value)), 0)
  const showStackShare = visible.length > 1 && rowTotal > 0
  return (
    <div className="rounded-xl border border-border bg-card/95 px-3 py-2.5 shadow-xl backdrop-blur-md">
      {label != null && label !== "" && (
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      )}
      <div className="min-w-[160px] space-y-1">
        {visible.map((entry: any, idx: number) => {
          const name = entry.name ?? entry.dataKey
          const color = entry.color ?? entry.stroke ?? entry.fill
          const value = Number(entry.value)
          const pieShare = typeof entry.percent === "number" ? entry.percent * 100 : null
          const stackShare = showStackShare && pieShare == null ? (Math.abs(value) / rowTotal) * 100 : null
          const share = pieShare ?? stackShare
          return (
            <div key={`${name}-${idx}`} className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
              <span className="truncate text-foreground/80">{name}</span>
              <span className="ml-auto flex items-baseline gap-1.5 font-medium text-foreground">
                <span>{symbol ?? ""}{value.toLocaleString()}</span>
                {share != null && (
                  <span className="text-[10px] font-normal text-muted-foreground">{share.toFixed(1)}%</span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Widget content ────────────────────────────────────────────────────────────

function WidgetContent({
  widget, kpi, monthlyData, categoryData, docTypeData,
  stackedCompositionData, composedData, bandedSpendData,
  currencyModel,
  dashboardAccent,
  contextSummary, contextSummaryDate, isGeneratingSummary, isPro, onGenerateSummary,
}: {
  widget: Widget
  kpi: KPIData
  monthlyData: MonthlyData[]
  categoryData: CategoryData[]
  docTypeData: CategoryData[]
  stackedCompositionData: { rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }
  composedData: ComposedRow[]
  bandedSpendData: BandedRow[]
  currencyModel: DashboardCurrencyModel
  dashboardAccent: string
  contextSummary: string | null
  contextSummaryDate: string | null
  isGeneratingSummary: boolean
  isPro: boolean
  onGenerateSummary: () => void
}) {
  const symbol = currencyToSymbol(kpi.currency)
  const { resolvedTheme } = useTheme()
  const themeMode: ThemeMode = resolvedTheme === "dark" ? "dark" : "light"
  // Per-widget override: widget.colors.primary if set, else dashboard accent.
  // Palette always derived so derived slots stay harmonious with the accent,
  // and extendPalette can grow the palette for categorical charts > 5 series.
  const effectiveAccent = widget.colors?.primary ?? dashboardAccent
  const colors = widget.colors ?? derivePalette(effectiveAccent, themeMode)
  // Pre-sized for up to 16 categorical slices so pie/stacked charts don't
  // repeat colors at 8+ series. extendPalette continues the HSL rotation.
  const MULTI_COLORS = extendPalette(effectiveAccent, 16, themeMode)
  const [activePieIndex, setActivePieIndex] = useState<number | null>(null)
  // Active-shape renderer factory. Currency symbol is optional — doc-count
  // pies (Document Distribution) have no symbol; value-driven pies pass one.
  const makeActiveSlice = (opts: { symbol?: string } = {}) => (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props
    const valueLabel = opts.symbol
      ? `${opts.symbol}${Number(value).toLocaleString()}`
      : Number(value).toLocaleString()
    return (
      <g>
        <text x={cx} y={cy - 10} textAnchor="middle" fill={fill} style={{ fontSize: 13, fontWeight: 600 }}>
          {payload.name ?? payload[payload.nameKey ?? "name"]}
        </text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="currentColor" style={{ fontSize: 12, fontWeight: 600 }}>
          {valueLabel}
        </text>
        <text x={cx} y={cy + 24} textAnchor="middle" fill="currentColor" opacity={0.55} style={{ fontSize: 11 }}>
          {(percent * 100).toFixed(1)}%
        </text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} innerRadius={outerRadius + 9} outerRadius={outerRadius + 11} startAngle={startAngle} endAngle={endAngle} fill={fill} opacity={0.4} />
      </g>
    )
  }
  const axisTickColor = themeMode === "dark" ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.5)"
  const gridStroke    = themeMode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
  const legendColor   = themeMode === "dark" ? "rgba(255,255,255,0.8)"  : "rgba(0,0,0,0.8)"

  // Multi-currency bucket order for stacked rows: primary first, then the rest
  // sorted by activity. Keeps the user's dominant currency anchored at the top.
  const orderedCurrencies = currencyModel.hasMultipleCurrencies
    ? [
        currencyModel.primaryCurrency,
        ...currencyModel.currencies
          .filter((c) => c !== currencyModel.primaryCurrency)
          .sort((a, b) => {
            const ba = currencyModel.buckets[a]
            const bb = currencyModel.buckets[b]
            const aAct = (ba?.totalIncome ?? 0) + (ba?.totalExpenses ?? 0)
            const bAct = (bb?.totalIncome ?? 0) + (bb?.totalExpenses ?? 0)
            return bAct - aAct
          }),
      ]
    : []
  const convertedBucket = currencyModel.convertedBucket

  if (widget.type === "kpi-income") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Income</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.primary + "20" }}>
          <TrendingUp className="h-4 w-4" style={{ color: colors.primary }} />
        </div>
      </div>
      {currencyModel.hasMultipleCurrencies && convertedBucket ? (
        <div className="mt-3">
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            <AnimatedNumber value={convertedBucket.totalIncome} prefix={currencyToSymbol(currencyModel.primaryCurrency)} />
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Converted to {currencyModel.primaryCurrency}
          </p>
        </div>
      ) : currencyModel.hasMultipleCurrencies ? (
        <div className="mt-3 space-y-1.5">
          {orderedCurrencies.map((cur) => {
            const b = currencyModel.buckets[cur]
            if (!b) return null
            return (
              <div key={cur} className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{cur}</span>
                <span className="text-xl font-semibold tracking-tight text-foreground">
                  {currencyToSymbol(cur)}{Math.round(b.totalIncome).toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          <AnimatedNumber value={kpi.totalIncome} prefix={symbol} />
        </p>
      )}
    </div>
  )

  if (widget.type === "kpi-expenses") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expenses</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.secondary + "20" }}>
          <Receipt className="h-4 w-4" style={{ color: colors.secondary }} />
        </div>
      </div>
      {currencyModel.hasMultipleCurrencies && convertedBucket ? (
        <div className="mt-3">
          <p className="text-3xl font-semibold tracking-tight text-foreground">
            <AnimatedNumber value={convertedBucket.totalExpenses} prefix={currencyToSymbol(currencyModel.primaryCurrency)} />
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Converted to {currencyModel.primaryCurrency}
          </p>
        </div>
      ) : currencyModel.hasMultipleCurrencies ? (
        <div className="mt-3 space-y-1.5">
          {orderedCurrencies.map((cur) => {
            const b = currencyModel.buckets[cur]
            if (!b) return null
            return (
              <div key={cur} className="flex items-baseline justify-between gap-3">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{cur}</span>
                <span className="text-xl font-semibold tracking-tight text-foreground">
                  {currencyToSymbol(cur)}{Math.round(b.totalExpenses).toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          <AnimatedNumber value={kpi.totalExpenses} prefix={symbol} />
        </p>
      )}
    </div>
  )

  if (widget.type === "kpi-net") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Position</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.primary + "20" }}>
          <Wallet className="h-4 w-4" style={{ color: colors.primary }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedNumber value={kpi.netPosition} prefix={symbol} />
      </p>
      <p className="text-xs text-muted-foreground">{kpi.totalIncome > 0 ? `${kpi.savingsRate.toFixed(1)}% ${kpi.savingsRate >= 0 ? "savings rate" : "overspend"}` : "No income data"}</p>
    </div>
  )

  if (widget.type === "kpi-tax-exposure") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Est. Tax Exposure</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.tertiary + "20" }}>
          <TrendingUp className="h-4 w-4" style={{ color: colors.tertiary }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedNumber value={kpi.taxExposure} prefix={symbol} />
      </p>
      <p className="text-xs text-muted-foreground">Gross income minus expenses</p>
    </div>
  )

  if (widget.type === "kpi-tax-ratio") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tax Burden Rate</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.quaternary + "20" }}>
          <Wallet className="h-4 w-4" style={{ color: colors.quaternary }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        {kpi.taxRatio.toFixed(1)}%
      </p>
      <p className="text-xs text-muted-foreground">Of gross income</p>
    </div>
  )

  // Sonnet R&D widgets — render the transformed data[] Sonnet returned,
  // not the dashboard's generic monthly/category series. Shared tick/grid
  // styling matches the rest of the chart library.
  if (widget.rdConfig) {
    const rd = widget.rdConfig
    const rdSymbol = currencyToSymbol(rd.currency)
    const axisProps = {
      xAxis: <XAxis dataKey={rd.x_key} tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />,
      yAxis: <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => Math.abs(v) >= 1000 ? `${rdSymbol}${(v/1000).toFixed(1)}k` : `${rdSymbol}${v}`} />,
      grid: <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />,
      tooltip: <Tooltip content={<CustomTooltip symbol={rdSymbol} />} />,
    }
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">{widget.title}</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            {rd.chart_type === "line-chart" ? (
              <LineChart data={rd.data as any[]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
                <Line type="monotone" dataKey={rd.data_key} stroke={colors.primary} strokeWidth={2.5} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            ) : rd.chart_type === "area-chart" ? (
              <AreaChart data={rd.data as any[]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`rdGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.25} /><stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
                <Area type="monotone" dataKey={rd.data_key} stroke={colors.primary} strokeWidth={2.5} fill={`url(#rdGrad-${widget.id})`} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            ) : rd.chart_type === "pie-chart" ? (
              <PieChart>
                <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, rd.data.length)}</defs>
                <Pie
                  data={rd.data as any[]}
                  cx="50%" cy="50%"
                  innerRadius="38%" outerRadius="62%"
                  paddingAngle={3}
                  dataKey={rd.data_key}
                  nameKey={rd.x_key}
                  activeIndex={activePieIndex ?? undefined}
                  activeShape={makeActiveSlice({ symbol: rdSymbol })}
                  onMouseEnter={(_: any, idx: number) => setActivePieIndex(idx)}
                  onMouseLeave={() => setActivePieIndex(null)}
                >
                  {rd.data.map((_, i) => <Cell key={i} fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} strokeWidth={0} />)}
                </Pie>
                <Tooltip content={<CustomTooltip symbol={rdSymbol} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
              </PieChart>
            ) : (
              <BarChart data={rd.data as any[]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={24}>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}
                <Bar dataKey={rd.data_key} fill={colors.primary} radius={[4,4,0,0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "area-chart") {
    const variant = widget.chartVariant ?? "area"
    const axisProps = {
      xAxis: <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />,
      yAxis: <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />,
      grid: <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />,
      tooltip: <Tooltip content={<CustomTooltip symbol={symbol} />} />,
      legend: <Legend wrapperStyle={{ fontSize: 12, color: legendColor }} />,
    }
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">Monthly income vs expenses from your documents</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "bar" ? (
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={20}>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
                <Bar dataKey="income" name="Income" fill={colors.primary} radius={[4,4,0,0]} />
                <Bar dataKey="expenses" name="Expenses" fill={colors.secondary} radius={[4,4,0,0]} />
              </BarChart>
            ) : variant === "line" ? (
              <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
                <Line type="monotone" dataKey="income" name="Income" stroke={colors.primary} strokeWidth={2.5} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="expenses" name="Expenses" stroke={colors.secondary} strokeWidth={2.5} dot={{ fill: colors.secondary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </LineChart>
            ) : (
              <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`incomeGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.primary} stopOpacity={0.25} /><stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`expenseGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.secondary} stopOpacity={0.2} /><stop offset="95%" stopColor={colors.secondary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {axisProps.grid}{axisProps.xAxis}{axisProps.yAxis}{axisProps.tooltip}{axisProps.legend}
                <Area type="monotone" dataKey="income" name="Income" stroke={colors.primary} strokeWidth={2.5} fill={`url(#incomeGrad-${widget.id})`} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke={colors.secondary} strokeWidth={2.5} fill={`url(#expenseGrad-${widget.id})`} dot={{ fill: colors.secondary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "line-chart") {
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">{widget.title ?? "Trend over time"}</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip symbol={symbol} />} />
              <Legend wrapperStyle={{ fontSize: 12, color: legendColor }} />
              <Line type="monotone" dataKey="income" name="Income" stroke={colors.primary} strokeWidth={2.5} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
              <Line type="monotone" dataKey="expenses" name="Expenses" stroke={colors.secondary} strokeWidth={2.5} dot={{ fill: colors.secondary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "bar-chart" || widget.type === "bar-deductible") {
    const variant = widget.chartVariant ?? "bar"
    const data = widget.type === "bar-deductible"
      ? (currencyModel.buckets[currencyModel.primaryCurrency]?.categoryData ?? categoryData)
      : categoryData
    const label = widget.type === "bar-deductible" ? "Expense categories reducing tax exposure" : "Total spend per category"
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">{label}</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "pie" ? (
              <PieChart>
                <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, data.length)}</defs>
                <Pie
                  data={data}
                  cx="50%" cy="50%"
                  innerRadius="38%" outerRadius="62%"
                  paddingAngle={3}
                  dataKey="value"
                  activeIndex={activePieIndex ?? undefined}
                  activeShape={makeActiveSlice({ symbol })}
                  onMouseEnter={(_: any, idx: number) => setActivePieIndex(idx)}
                  onMouseLeave={() => setActivePieIndex(null)}
                >
                  {data.map((_, i) => <Cell key={i} fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} strokeWidth={0} />)}
                </Pie>
                <Tooltip content={<CustomTooltip symbol={symbol} />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
              </PieChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
                <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, data.length)}</defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip symbol={symbol} />} />
                <Bar dataKey="value" name={widget.type === "bar-deductible" ? "Deductible" : "Amount"} radius={[6, 6, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "pie-chart") {
    const variant = widget.chartVariant ?? "pie"
    return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs text-muted-foreground">Breakdown by document type</p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {variant === "bar" ? (
            <BarChart data={docTypeData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
              <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, docTypeData.length)}</defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                {docTypeData.map((_, i) => <Cell key={i} fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} />)}
              </Bar>
            </BarChart>
          ) : (
          <PieChart>
            <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, docTypeData.length)}</defs>
            <Pie
              data={docTypeData}
              cx="50%" cy="50%"
              innerRadius="40%" outerRadius="62%"
              paddingAngle={3}
              dataKey="value"
              activeIndex={activePieIndex ?? undefined}
              activeShape={makeActiveSlice()}
              onMouseEnter={(_: any, idx: number) => setActivePieIndex(idx)}
              onMouseLeave={() => setActivePieIndex(null)}
            >
              {docTypeData.map((_, i) => (
                <Cell key={i} fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
          </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
  }

  if (widget.type === "stacked-bar") {
    const groupLabel = stackedCompositionData.groupBy === "merchant_domain" ? "merchant domain" : "expense category"
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">Monthly spend share by {groupLabel}</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stackedCompositionData.rows} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={24}>
              <defs>{renderCategoricalDefs(widget.id, MULTI_COLORS, themeMode, stackedCompositionData.seriesKeys.length)}</defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip symbol={symbol} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
              {stackedCompositionData.seriesKeys.map((key, i) => (
                <Bar key={key} dataKey={key} name={key} stackId="spend" fill={categoricalFillFor(widget.id, MULTI_COLORS, i)} radius={i === stackedCompositionData.seriesKeys.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "composed-chart") {
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">Income, expenses, and net position per month</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={composedData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`netGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.tertiary} stopOpacity={0.25} /><stop offset="95%" stopColor={colors.tertiary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip symbol={symbol} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
              <Area type="monotone" dataKey="net" name="Net" stroke={colors.tertiary} strokeWidth={2} fill={`url(#netGrad-${widget.id})`} />
              <Bar dataKey="expenses" name="Expenses" fill={colors.secondary} radius={[4,4,0,0]} barSize={18} />
              <Line type="monotone" dataKey="income" name="Income" stroke={colors.primary} strokeWidth={2.5} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "banded-area") {
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">Monthly spend vs trailing normal range (mean ± 1σ)</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={bandedSpendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`bandGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.primary} stopOpacity={0.18} /><stop offset="95%" stopColor={colors.primary} stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: axisTickColor }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<CustomTooltip symbol={symbol} />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: legendColor }} />
              <Area type="monotone" dataKey="lower" stackId="band" stroke="none" fill="transparent" legendType="none" />
              <Area type="monotone" dataKey="bandWidth" name="Normal range" stackId="band" stroke="none" fill={`url(#bandGrad-${widget.id})`} />
              <Line type="monotone" dataKey="mean" name="Trailing mean" stroke={colors.quaternary} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="actual" name="Actual spend" stroke={colors.primary} strokeWidth={2.5} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  if (widget.type === "context-summary") {
    if (!isPro) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: colors.primary + "20" }}>
            <Lock className="h-5 w-5" style={{ color: colors.primary }} />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Context Summary</p>
            <p className="mt-1 text-xs text-muted-foreground">Pro feature — upgrade to generate</p>
          </div>
        </div>
      )
    }
    if (contextSummary) {
      return (
        <div className="flex h-full flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: colors.primary + "20" }}>
                <Sparkles className="h-3.5 w-3.5" style={{ color: colors.primary }} />
              </div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Summary</p>
            </div>
            <button
              onClick={onGenerateSummary}
              disabled={isGeneratingSummary}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            >
              {isGeneratingSummary ? "Generating..." : "Refresh"}
            </button>
          </div>
          <p className="flex-1 overflow-auto text-sm leading-relaxed text-foreground">{contextSummary}</p>
          {contextSummaryDate && (
            <p className="text-xs text-muted-foreground">
              Generated {new Date(contextSummaryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
        </div>
      )
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: colors.primary + "20" }}>
          <Sparkles className="h-5 w-5" style={{ color: colors.primary }} />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Context Summary</p>
          <p className="mt-1 text-xs text-muted-foreground">AI-generated financial narrative</p>
        </div>
        <button
          onClick={onGenerateSummary}
          disabled={isGeneratingSummary}
          className="mt-1 rounded-lg px-4 py-2 text-xs font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: colors.primary }}
        >
          {isGeneratingSummary ? "Generating..." : "Generate Summary"}
        </button>
      </div>
    )
  }

  return null
}

// ── Color picker swatch ───────────────────────────────────────────────────────

function ColorSwatch({ color, onClick, isActive }: { color: string; onClick: () => void; isActive: boolean }) {
  return (
    <button
      onClick={onClick}
      className="relative h-5 w-5 rounded-full transition-transform hover:scale-110 focus:outline-none"
      style={{ background: color }}
    >
      {isActive && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Check className="h-3 w-3 text-white drop-shadow" />
        </span>
      )}
    </button>
  )
}

// ── Readiness hint (Advanced Analytics dropdown footer) ───────────────────────
// Renders the state-aware copy that tells the user what their next run will do
// or why the output will not change. Driven entirely by evaluateReadiness().

function ReadinessHint({ state }: { state: ReadinessState }) {
  if (state.kind === "empty") {
    return (
      <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        Upload receipts, invoices, or payslips to unlock advanced analytics.
      </p>
    )
  }

  if (state.kind === "sparse") {
    const hint = state.nextUnlocks[0]
    return (
      <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        {hint ? `${describeUnlockHint(hint)}.` : "A little more data unlocks your first advanced analytic."}
      </p>
    )
  }

  if (state.kind === "unlock_moment") {
    return (
      <div className="mt-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-foreground">
        <span className="font-medium text-primary">New angle available:</span>{" "}
        {state.unlocked.join(", ").toLowerCase()}.
      </div>
    )
  }

  if (state.kind === "new_signal") {
    return (
      <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
        New {state.changedAxes.slice(0, 2).join(" and ")} since your last run — visualizations may shift.
      </p>
    )
  }

  // stable
  const hint = state.nextUnlocks[0]
  return (
    <p className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {hint
        ? `No new signal since your last run. ${describeUnlockHint(hint).charAt(0).toUpperCase() + describeUnlockHint(hint).slice(1)}.`
        : "No new signal since your last run — upload more documents to see richer analytics."}
    </p>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartDashboardPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<KPIData>({ totalIncome: 0, totalExpenses: 0, netPosition: 0, savingsRate: 0, taxExposure: 0, taxRatio: 0, currency: "USD" })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [docTypeData, setDocTypeData] = useState<CategoryData[]>([])
  const [stackedCompositionData, setStackedCompositionData] = useState<{ rows: StackedRow[]; seriesKeys: string[]; groupBy: "merchant_domain" | "expense_category" }>({ rows: [], seriesKeys: [], groupBy: "expense_category" })
  const [composedData, setComposedData] = useState<ComposedRow[]>([])
  const [bandedSpendData, setBandedSpendData] = useState<BandedRow[]>([])
  const [currencyModel, setCurrencyModel] = useState<DashboardCurrencyModel>(EMPTY_CURRENCY_MODEL)
  const [widgets, setWidgets] = useState<Widget[]>([])
  const [layout, setLayout] = useState<LayoutItem[]>([])
  const [dashboardAccent, setDashboardAccent] = useState<string>(DEFAULT_ACCENT)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isEditingLayout, setIsEditingLayout] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState(false)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false)
  const [showWidgetPanel, setShowWidgetPanel] = useState(false)
  const [mobileWidgetPanelOpen, setMobileWidgetPanelOpen] = useState(false)
  const isMobile = useIsMobile()
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [readinessState, setReadinessState] = useState<ReadinessState>({ kind: "empty" })
  const [currentSignature, setCurrentSignature] = useState<CorpusSignature | null>(null)
  const { isActive: isPro } = useEntitlement(session)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [contextSummary, setContextSummary] = useState<string | null>(null)
  const [contextSummaryDate, setContextSummaryDate] = useState<string | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const [advancedWidgetsList, setAdvancedWidgetsList] = useState<AdvancedWidget[]>([])
  const [isRunningAnalytics, setIsRunningAnalytics] = useState(false)
  const [analyticsToast, setAnalyticsToast] = useState<string | null>(null)
  const [standardOpen, setStandardOpen] = useState(true)
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; widgetId: string } | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const dateFilterCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advancedMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colorPickerCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

  useEffect(() => {
    return () => {
      if (dateFilterCloseTimerRef.current) clearTimeout(dateFilterCloseTimerRef.current)
      if (advancedMenuCloseTimerRef.current) clearTimeout(advancedMenuCloseTimerRef.current)
      if (colorPickerCloseTimerRef.current) clearTimeout(colorPickerCloseTimerRef.current)
    }
  }, [])

  function cancelDateFilterClose() {
    if (dateFilterCloseTimerRef.current) {
      clearTimeout(dateFilterCloseTimerRef.current)
      dateFilterCloseTimerRef.current = null
    }
  }

  function scheduleDateFilterClose() {
    cancelDateFilterClose()
    dateFilterCloseTimerRef.current = setTimeout(() => {
      setShowDateFilter(false)
      dateFilterCloseTimerRef.current = null
    }, 180)
  }

  function cancelAdvancedMenuClose() {
    if (advancedMenuCloseTimerRef.current) {
      clearTimeout(advancedMenuCloseTimerRef.current)
      advancedMenuCloseTimerRef.current = null
    }
  }

  function scheduleAdvancedMenuClose() {
    cancelAdvancedMenuClose()
    advancedMenuCloseTimerRef.current = setTimeout(() => {
      setShowAdvancedMenu(false)
      advancedMenuCloseTimerRef.current = null
    }, 180)
  }

  function cancelColorPickerClose() {
    if (colorPickerCloseTimerRef.current) {
      clearTimeout(colorPickerCloseTimerRef.current)
      colorPickerCloseTimerRef.current = null
    }
  }

  function scheduleColorPickerClose() {
    cancelColorPickerClose()
    colorPickerCloseTimerRef.current = setTimeout(() => {
      setShowColorPicker(false)
      colorPickerCloseTimerRef.current = null
    }, 180)
  }

  // ── Measure canvas width ───────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (canvasRef.current) setContainerWidth(canvasRef.current.offsetWidth - 32)
    }
    // Double rAF: first frame lets flex layout resolve, second guarantees paint is complete
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(measure)
      return raf2
    })
    const observer = new ResizeObserver(measure)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener("resize", measure)
    return () => {
      cancelAnimationFrame(raf1)
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [])

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setSessionLoaded(true) })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load layout from DB ────────────────────────────────────────────────────
  const loadLayout = useCallback(async () => {
    if (!session?.user?.id) {
      setWidgets([])
      setLayout([])
      return
    }
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("layout")
      .eq("user_id", session.user.id)
      .maybeSingle()
    if (data?.layout) {
      const saved = data.layout
      const savedWidgets: Widget[] = saved.widgets?.length ? saved.widgets : []
      const widgetById = new Map<string, Widget>(savedWidgets.map((widget) => [widget.id, widget]))
      setWidgets(savedWidgets)
      if (saved.palette?.accent) setDashboardAccent(saved.palette.accent)
      if (saved.gridLayout?.length) {
        // Always apply current minH/minW — never restore stale saved constraints
        setLayout(saved.gridLayout.map((l: any) => ({
          i: l.i,
          x: l.x,
          y: l.y,
          w: l.w,
          h: l.h,
        })).map((item: LayoutItem) => compactStaleWidgetSize(item, widgetById.get(item.i))))
      } else {
        setLayout([])
      }
    } else {
      setWidgets([])
      setLayout([])
    }
  }, [session])

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const { data: userFiles } = await supabase
      .from("files")
      .select("id, document_type")
      .eq("user_id", session.user.id)

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    let query = supabase
      .from("document_fields")
      .select("file_id, document_date, total_amount, gross_income, net_income, expense_category, merchant_domain, currency, files!inner(document_type, filename)")
      .in("file_id", fileIds)
      .order("document_date", { ascending: true })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data: fields } = await query
    if (!fields?.length) { setLoading(false); return }

    const safeNum = (v: unknown): number => { const n = parseFloat(String(v ?? "0")); return isNaN(n) ? 0 : n }

    // Currency-bucketed model. Primary bucket drives KPI/chart states so the
    // single-currency render path stays identical. Income/Expenses tiles read
    // the full model to stack per-currency rows when more than one exists.
    const nativeModel = buildCurrencyModel(fields as any[], safeNum)
    const fx = nativeModel.hasMultipleCurrencies
      ? await loadFxRates(
          nativeModel.primaryCurrency,
          nativeModel.currencies.filter((cur) => cur !== nativeModel.primaryCurrency),
        )
      : null
    const model = withConvertedCurrencyBucket(nativeModel, fields as any[], fx, safeNum)
    setCurrencyModel(model)
    const primary = model.buckets[model.primaryCurrency]
    const aggregate = model.convertedBucket ?? primary

    if (primary && aggregate) {
      setKpi({
        totalIncome:   aggregate.totalIncome,
        totalExpenses: aggregate.totalExpenses,
        netPosition:   aggregate.netPosition,
        savingsRate:   aggregate.savingsRate,
        taxExposure:   primary.taxExposure,
        taxRatio:      primary.taxRatio,
        currency:      primary.currency,
      })
      setMonthlyData(aggregate.monthlyData)
      setCategoryData(aggregate.categoryData)
      setStackedCompositionData(aggregate.stackedComposition)
      setComposedData(aggregate.composedData)
      setBandedSpendData(aggregate.bandedData)
    }

    // Document Distribution is count-based and stays cross-currency global.
    const typeMap: Record<string, number> = {}
    userFiles.forEach((f) => { typeMap[f.document_type] = (typeMap[f.document_type] ?? 0) + 1 })
    setDocTypeData(Object.entries(typeMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })))

    setLoading(false)
  }, [session, dateFrom, dateTo])

  // Readiness evaluation: computed from the full corpus (no date filter) so the
  // Advanced Analytics trigger state is stable across filter changes. Compared
  // against the signature persisted at the last successful run.
  const loadReadinessState = useCallback(async () => {
    if (!session?.user?.id) return

    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)

    if (!userFiles?.length) {
      setCurrentSignature(computeCorpusSignature([]))
      setReadinessState({ kind: "empty" })
      return
    }

    const fileIds = userFiles.map((f) => f.id)
    const { data: fieldRows } = await supabase
      .from("document_fields")
      .select("document_date, vendor_normalized, expense_category, merchant_domain, merchant_address_region, is_recurring, line_items")
      .in("file_id", fileIds)

    const signature = computeCorpusSignature(fieldRows ?? [])
    setCurrentSignature(signature)

    const { data: profile } = await supabase
      .from("user_analytics_profile")
      .select("last_run_signature")
      .eq("user_id", session.user.id)
      .maybeSingle()

    const lastSignature = normalizeSignature(profile?.last_run_signature)
    setReadinessState(evaluateReadiness(signature, lastSignature))
  }, [session])

  useEffect(() => { loadReadinessState() }, [loadReadinessState])

  useEffect(() => { loadLayout() }, [loadLayout])
  useEffect(() => { loadData() }, [loadData])

  // ── Context summary ────────────────────────────────────────────────────────
  const loadContextSummary = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("context_summaries")
      .select("summary, generated_at")
      .eq("user_id", session.user.id)
      .single()
    if (data) {
      setContextSummary(data.summary)
      setContextSummaryDate(data.generated_at)
    }
  }, [session])

  useEffect(() => { loadContextSummary() }, [loadContextSummary])

  // ── Advanced widgets ────────────────────────────────────────────────────────
  const loadAdvancedWidgets = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("advanced_widgets")
      .select("*")
      .eq("user_id", session.user.id)
      .or("expires_at.is.null,expires_at.gt." + new Date().toISOString())
      .order("is_starred", { ascending: false })
      .order("created_at", { ascending: false })
    if (data) setAdvancedWidgetsList(data)
  }, [session])

  useEffect(() => { loadAdvancedWidgets() }, [loadAdvancedWidgets])

  const toggleStarAdvancedWidget = async (aw: AdvancedWidget) => {
    const newStarred = !aw.is_starred
    const expiresAt  = newStarred || aw.is_plotted
      ? null
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from("advanced_widgets").update({ is_starred: newStarred, expires_at: expiresAt }).eq("id", aw.id)
    setAdvancedWidgetsList(prev => prev
      .map(w => w.id === aw.id ? { ...w, is_starred: newStarred, expires_at: expiresAt } : w)
      .sort((a, b) => (b.is_starred ? 1 : 0) - (a.is_starred ? 1 : 0))
    )
  }

  const plotAdvancedWidget = async (aw: AdvancedWidget) => {
    if (!isEditingLayout) return
    if (widgets.some(w => w.advancedId === aw.id)) return
    await supabase.from("advanced_widgets").update({ is_plotted: true, expires_at: null }).eq("id", aw.id)
    setAdvancedWidgetsList(prev => prev.map(w => w.id === aw.id ? { ...w, is_plotted: true, expires_at: null } : w))
    const rdConfig = aw.widget_type === "rd-insight" && aw.config && (aw.config as any).source === "rd"
      ? (aw.config as unknown as RdWidgetConfig)
      : undefined
    const newWidget: Widget = {
      id:         `adv-${aw.id}`,
      type:       rdConfig ? rdConfig.chart_type : aw.widget_type,
      title:      aw.title,
      isPremium:  true,
      advancedId: aw.id,
      insight:    aw.insight ?? undefined,
      rdConfig,
    }
    const lastY = layout.length ? Math.max(...layout.map(l => l.y + l.h)) : 0
    const minSize = WIDGET_MIN_SIZE[aw.widget_type] ?? widgetMinSize(newWidget.type)
    setWidgets(prev => [...prev, newWidget])
    setLayout(prev => [...prev, { i: newWidget.id, x: 0, y: lastY, w: minSize.minW, h: minSize.minH, minW: minSize.minW, minH: minSize.minH }])
    setIsDirty(true)
  }

  const runAdvancedAnalytics = async () => {
    if (!session?.user?.id || !isPro || isRunningAnalytics) return
    setIsRunningAnalytics(true)
    try {
      const { data: { session: cur } } = await supabase.auth.getSession()
      const plottedAdvancedTypes = advancedWidgetsList
        .filter((widget) => widget.is_plotted)
        .map((widget) => widget.widget_type)

      const authHeaders = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cur?.access_token}`,
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      }

      // Corpus signature gate for the Sonnet R&D path. Mirrors the server-side
      // threshold in generate-rd-analytics — kept in sync deliberately so the
      // client can short-circuit before paying the round-trip.
      const rdEligible = !!currentSignature
        && currentSignature.monthSpan    >= 6
        && currentSignature.fieldsCount >= 12

      // Standard Haiku path — always runs.
      const haikuReq = fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-advanced-analytics`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          user_id: session.user.id,
          existing_widget_types: widgets.map(w => w.type),
          plotted_advanced_types: plottedAdvancedTypes,
        }),
      })

      // Sonnet R&D path — only when corpus is past the threshold. Failure here
      // must not block the Haiku result from reaching the user.
      const rdReq = rdEligible
        ? fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-rd-analytics`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({
              user_id: session.user.id,
              haiku_chart_families: plottedAdvancedTypes,
            }),
          }).catch(() => null)
        : Promise.resolve(null)

      const [haikuRes, rdRes] = await Promise.all([haikuReq, rdReq])

      let haikuCount = 0
      let rdCount    = 0
      if (haikuRes?.ok) {
        const data = await haikuRes.json()
        haikuCount = data.count ?? 0
      }
      if (rdRes?.ok) {
        const data = await rdRes.json()
        rdCount = data.count ?? 0
      }

      if (haikuRes?.ok || (rdRes && rdRes.ok)) {
        await loadAdvancedWidgets()
        // Persist the corpus signature at the moment of this successful run so
        // the next readiness evaluation can tell whether new signal has arrived.
        if (currentSignature) {
          await supabase
            .from("user_analytics_profile")
            .upsert(
              {
                user_id: session.user.id,
                last_run_signature: currentSignature,
                last_run_at: new Date().toISOString(),
              },
              { onConflict: "user_id" },
            )
        }
        await loadReadinessState()
        setShowAdvancedMenu(false)
        const total = haikuCount + rdCount
        const suffix = rdCount > 0 ? ` (${rdCount} deep-insight)` : ""
        setAnalyticsToast(`${total} new visualization${total !== 1 ? "s" : ""} available${suffix}. Check the Advanced section of your Visualizations panel.`)
        setTimeout(() => setAnalyticsToast(null), 7000)
      }
    } finally {
      setIsRunningAnalytics(false)
    }
  }

  const generateContextSummary = async () => {
    if (!session?.user?.id || !isPro || isGeneratingSummary) return
    setIsGeneratingSummary(true)
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-context-summary`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${currentSession?.access_token}`,
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({ user_id: session.user.id }),
      })
      if (res.ok) {
        const data = await res.json()
        setContextSummary(data.summary)
        setContextSummaryDate(new Date().toISOString())
      }
    } finally {
      setIsGeneratingSummary(false)
    }
  }

  // ── Save layout ────────────────────────────────────────────────────────────
  const saveLayout = async () => {
    if (!session?.user?.id) return
    setIsSaving(true)
    await supabase.from("dashboard_layouts").upsert({
      user_id: session.user.id,
      layout: { widgets, gridLayout: layout, palette: { accent: dashboardAccent } },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    setIsSaving(false)
    setIsDirty(false)
    setIsEditingLayout(false)
    setSelectedWidgetId(null)
    setShowColorPicker(false)
    setSavedConfirm(true)
    setTimeout(() => setSavedConfirm(false), 2000)
  }

  // ── Widget management ──────────────────────────────────────────────────────
  const addWidget = (type: string, title: string, isPremium: boolean) => {
    if (!isEditingLayout) return
    if (isPremium && !isPro) return
    if (widgets.some(w => w.type === type)) return
    const id = `${type}-${Date.now()}`
    const minSize = widgetMinSize(type)
    setWidgets(prev => [...prev, { id, type, title }])
    setLayout(prev => [...prev, { i: id, x: 0, y: Infinity, w: minSize.minW, h: minSize.minH, minW: minSize.minW, minH: minSize.minH }])
    setIsDirty(true)
  }

  const removeWidget = (id: string) => {
    if (!isEditingLayout) return
    const widget = widgets.find(w => w.id === id)
    if (widget?.advancedId) {
      const aw = advancedWidgetsList.find(a => a.id === widget.advancedId)
      const expiresAt = aw?.is_starred ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      supabase.from("advanced_widgets").update({ is_plotted: false, expires_at: expiresAt }).eq("id", widget.advancedId)
      setAdvancedWidgetsList(prev => prev.map(a => a.id === widget.advancedId ? { ...a, is_plotted: false, expires_at: expiresAt } : a))
    }
    setWidgets(prev => prev.filter(w => w.id !== id))
    setLayout(prev => prev.filter(l => l.i !== id))
    if (selectedWidgetId === id) setSelectedWidgetId(null)
    setIsDirty(true)
  }

  // Accent-only palette wiring. Roles are derived at render time from
  // widget.colors.primary (if set) else dashboardAccent, so the stored slots
  // are populated for backward compatibility but the render ignores them.
  const updateDashboardAccent = (accent: string) => {
    if (!isEditingLayout) return
    setDashboardAccent(accent)
    setIsDirty(true)
  }

  const updateWidgetAccent = (widgetId: string, accent: string) => {
    if (!isEditingLayout) return
    const palette = derivePalette(accent, "light")
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, colors: palette } : w))
    setIsDirty(true)
  }

  const clearWidgetColors = (widgetId: string) => {
    if (!isEditingLayout) return
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, colors: undefined } : w))
    setIsDirty(true)
  }

  const updateWidgetChartVariant = (widgetId: string, variant: string) => {
    if (!isEditingLayout) return
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, chartVariant: variant } : w))
    setIsDirty(true)
  }

  const handleLayoutChange = (newLayout: RGLLayout) => {
    if (isMobile || !isEditingLayout) return
    // RGLLayout items are readonly — spread into our mutable LayoutItem shape
    const nextLayout = (newLayout as any[]).map((l: any) => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, minW: l.minW, minH: l.minH }))
    const currentKey = JSON.stringify(layout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))
    const nextKey = JSON.stringify(nextLayout.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })))
    if (currentKey === nextKey) return
    setLayout(nextLayout)
    setIsDirty(true)
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  const symbol = currencyToSymbol(kpi.currency)
  const resolvedLayout = (isMobile ? toMobileLayout(layout) : layout).map((item) => ({
    ...item,
    static: isMobile || !isEditingLayout,
  }))

  const dashboardToolbar = (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">
        <div
          className="relative"
          onMouseEnter={!isMobile ? cancelDateFilterClose : undefined}
          onMouseLeave={!isMobile && showDateFilter ? scheduleDateFilterClose : undefined}
        >
          <button
            onClick={() => { cancelDateFilterClose(); setShowDateFilter(!showDateFilter); setShowColorPicker(false) }}
            className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground"
          >
            <Calendar className="h-3.5 w-3.5" />
            {dateFrom && dateTo ? `${dateFrom} - ${dateTo}` : "All time"}
            <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
          </button>
          <div className={`absolute left-0 top-9 z-30 origin-top-left rounded-xl border border-border bg-card p-4 shadow-xl transition-all duration-200 ${
            showDateFilter
              ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
              : "pointer-events-none -translate-y-1 scale-95 opacity-0"
          }`}>
            <div className="space-y-1">
              {(() => {
                const today = new Date()
                const fmt = (d: Date) => d.toISOString().slice(0, 10)
                const todayStr = fmt(today)
                const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay()
                const lastSun = new Date(today); lastSun.setDate(today.getDate() - dayOfWeek)
                const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6)
                const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                const lastMonthEnd = new Date(firstOfThisMonth); lastMonthEnd.setDate(lastMonthEnd.getDate() - 1)
                const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)

                return [
                  { label: "All time", from: "", to: "" },
                  { label: "This year", from: `${today.getFullYear()}-01-01`, to: todayStr },
                  { label: "Last week", from: fmt(lastMon), to: fmt(lastSun) },
                  { label: "Last month", from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
                ]
              })().map(p => (
                <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); setShowDateFilter(false) }}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${dateFrom === p.from && dateTo === p.to ? "bg-primary/10 font-medium text-primary" : "text-foreground"}`}
                >{p.label}</button>
              ))}
              <div className="my-1 h-px bg-border" />
              <div className="flex items-center gap-2 pt-1">
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
                <span className="text-xs text-muted-foreground">to</span>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
              </div>
            </div>
          </div>
        </div>

        {!isMobile && (() => {
          const betaEmail = process.env.NEXT_PUBLIC_AA_BETA_EMAIL
          const isBetaUser = betaEmail && session?.user?.email === betaEmail
          const canUseAA = isPro && isBetaUser
          return canUseAA ? (
            <button
              onClick={runAdvancedAnalytics}
              disabled={isRunningAnalytics || readinessState.kind === "empty"}
              className={`flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground ${
                readinessState.kind === "unlock_moment"
                  ? "border-primary/60 text-foreground [box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
                  : "border-border text-muted-foreground"
              } disabled:opacity-50`}
            >
              {isRunningAnalytics ? <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isRunningAnalytics ? "Generating..." : "Advanced Analytics"}
            </button>
          ) : (
            <Link
              href="/pricing"
              title="Upgrade to Pro to unlock Advanced Analytics"
              className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground opacity-40 transition-opacity hover:opacity-70"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Advanced Analytics
              <Lock className="h-3 w-3" />
            </Link>
          )
        })()}

        {!isMobile && isEditingLayout && (() => {
          const pickerScope: "widget" | "dashboard" = selectedWidget ? "widget" : "dashboard"
          const currentAccent = pickerScope === "widget"
            ? (selectedWidget!.colors?.primary ?? dashboardAccent)
            : dashboardAccent
          const hasOverride = pickerScope === "widget" && !!selectedWidget!.colors?.primary
          const setAccent = (hex: string) => {
            if (pickerScope === "widget") updateWidgetAccent(selectedWidget!.id, hex)
            else updateDashboardAccent(hex)
          }
          return (
            <div
              className="relative flex items-center gap-1.5"
              onMouseEnter={cancelColorPickerClose}
              onMouseLeave={showColorPicker ? scheduleColorPickerClose : undefined}
            >
              <div className="mx-1 h-4 w-px bg-border" />
              <span className="text-xs text-muted-foreground">
                {pickerScope === "widget" ? "Widget color:" : "Dashboard color:"}
              </span>
              <div className="relative">
                <button
                  onClick={() => { cancelColorPickerClose(); setShowColorPicker(!showColorPicker) }}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                >
                  <span className="h-4 w-4 rounded-full border border-white/10" style={{ background: currentAccent }} />
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className={`absolute left-0 top-9 z-30 w-64 origin-top-left rounded-xl border border-border bg-card p-4 shadow-xl transition-all duration-200 ${
                  showColorPicker
                    ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                    : "pointer-events-none -translate-y-1 scale-95 opacity-0"
                }`}>
                  <p className="mb-3 text-xs font-medium text-muted-foreground">
                    {pickerScope === "widget" ? "Widget accent" : "Dashboard accent"}
                  </p>
                  <div className="grid grid-cols-8 gap-1.5">
                    {CURATED_ACCENTS.map((hex) => {
                      const isActive = currentAccent.toLowerCase() === hex.toLowerCase()
                      return (
                        <button
                          key={hex}
                          onClick={() => setAccent(hex)}
                          className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${isActive ? "border-foreground ring-2 ring-foreground/20" : "border-white/10"}`}
                          style={{ background: hex }}
                          title={hex}
                        />
                      )
                    })}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex flex-1 items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground">
                      <span>Custom</span>
                      <input
                        type="color"
                        value={currentAccent}
                        onChange={(e) => setAccent(e.target.value)}
                        className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                      />
                      <span className="ml-auto font-mono text-[10px] uppercase">{currentAccent}</span>
                    </label>
                  </div>
                  {hasOverride && (
                    <button
                      onClick={() => { clearWidgetColors(selectedWidget!.id); setShowColorPicker(false) }}
                      className="mt-3 w-full rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                    >
                      Reset to dashboard accent
                    </button>
                  )}
                </div>
              </div>
              {selectedWidget && (
                <span className="max-w-[120px] truncate text-xs text-muted-foreground">
                  {selectedWidget.title}
                </span>
              )}
            </div>
          )
        })()}

        {!isMobile && isEditingLayout && selectedWidget && CHART_TYPE_OPTIONS[selectedWidget.type] && (
          <div className="flex items-center gap-1">
            <div className="mx-1 h-4 w-px bg-border" />
            <span className="text-xs text-muted-foreground">Chart:</span>
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              {CHART_TYPE_OPTIONS[selectedWidget.type].map(opt => {
                const active = (selectedWidget.chartVariant ?? CHART_DEFAULT[selectedWidget.type]) === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => updateWidgetChartVariant(selectedWidget.id, opt.value)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {!isMobile && (
        <div className="flex shrink-0 items-center gap-2">
          <span className={`text-xs font-medium ${isEditingLayout ? "text-primary" : "text-muted-foreground"}`}>
            {savedConfirm ? "Saved / Locked" : isEditingLayout ? (isDirty ? "Editing - Unsaved" : "Editing") : "Saved / Locked"}
          </span>
          <button
            onClick={() => {
              if (!isEditingLayout) {
                setIsEditingLayout(true)
                setShowWidgetPanel(true)
                return
              }
              if (isDirty) {
                void saveLayout()
                return
              }
              setIsEditingLayout(false)
              setSelectedWidgetId(null)
              setShowColorPicker(false)
              setShowAdvancedMenu(false)
              setShowDateFilter(false)
            }}
            disabled={isSaving}
            className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-all ${
              !isEditingLayout
                ? "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                : isDirty
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border text-primary hover:bg-primary/5"
            }`}
          >
            {savedConfirm ? <><Check className="h-3.5 w-3.5" /> Saved</>
              : isSaving ? <><div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> Saving...</>
              : !isEditingLayout ? <><LayoutGrid className="h-3.5 w-3.5" /> Edit Layout</>
              : isDirty ? <><Save className="h-3.5 w-3.5" /> Save Layout</>
              : <><Lock className="h-3.5 w-3.5" /> Lock Layout</>}
          </button>
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar wide toolSlot={dashboardToolbar} />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* TOP TOOLBAR */}
        <div className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 md:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-visible">

            {/* Date filter */}
            <div
              className="relative"
              onMouseEnter={!isMobile ? cancelDateFilterClose : undefined}
              onMouseLeave={!isMobile && showDateFilter ? scheduleDateFilterClose : undefined}
            >
              <button
                onClick={() => { cancelDateFilterClose(); setShowDateFilter(!showDateFilter); setShowColorPicker(false) }}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground"
              >
                <Calendar className="h-3.5 w-3.5" />
                {dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "All time"}
                <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
              </button>
              <div className={`absolute left-0 top-9 z-30 origin-top-left rounded-xl border border-border bg-card p-4 shadow-xl transition-all duration-200 ${
                showDateFilter
                  ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                  : "pointer-events-none -translate-y-1 scale-95 opacity-0"
              }`}>
                  <div className="space-y-1">
                    {(() => {
                      const today = new Date()
                      const fmt = (d: Date) => d.toISOString().slice(0, 10)
                      const todayStr = fmt(today)

                      // Last week: Mon–Sun of the previous calendar week
                      const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay() // 1=Mon…7=Sun
                      const lastSun = new Date(today); lastSun.setDate(today.getDate() - dayOfWeek)
                      const lastMon = new Date(lastSun); lastMon.setDate(lastSun.getDate() - 6)

                      // Last month: full previous calendar month
                      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
                      const lastMonthEnd = new Date(firstOfThisMonth); lastMonthEnd.setDate(lastMonthEnd.getDate() - 1)
                      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)

                      return [
                        { label: "All time", from: "", to: "" },
                        { label: "This year", from: `${today.getFullYear()}-01-01`, to: todayStr },
                        { label: "Last week", from: fmt(lastMon), to: fmt(lastSun) },
                        { label: "Last month", from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
                      ]
                    })().map(p => (
                      <button key={p.label} onClick={() => { setDateFrom(p.from); setDateTo(p.to); setShowDateFilter(false) }}
                        className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${dateFrom === p.from && dateTo === p.to ? "bg-primary/10 font-medium text-primary" : "text-foreground"}`}
                      >{p.label}</button>
                    ))}
                    <div className="h-px bg-border my-1" />
                    <div className="flex items-center gap-2 pt-1">
                      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
                      <span className="text-xs text-muted-foreground">to</span>
                      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
                    </div>
                  </div>
              </div>
            </div>

            {/* Advanced Analytics — desktop only */}
            {!isMobile && (() => {
              const betaEmail = process.env.NEXT_PUBLIC_AA_BETA_EMAIL
              const isBetaUser = betaEmail && session?.user?.email === betaEmail
              const canUseAA = isPro && isBetaUser
              return (
                <div
                  className="relative"
                  onMouseEnter={cancelAdvancedMenuClose}
                  onMouseLeave={showAdvancedMenu ? scheduleAdvancedMenuClose : undefined}
                >
                  {canUseAA ? (
                    <button
                      onClick={() => { cancelAdvancedMenuClose(); setShowAdvancedMenu(!showAdvancedMenu); setShowColorPicker(false); setShowDateFilter(false) }}
                      className={`flex h-7 items-center gap-1.5 rounded-lg border px-3 text-xs transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground ${
                        readinessState.kind === "unlock_moment"
                          ? "border-primary/60 text-foreground [box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Advanced Analytics
                      {readinessState.kind === "unlock_moment" && (
                        <span className="flex items-center gap-1 ml-1 text-primary">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                          </span>
                          <span className="text-[10px] font-medium">Unlocked</span>
                        </span>
                      )}
                      {readinessState.kind === "new_signal" && (
                        <span className="flex items-center gap-1 ml-1 text-primary">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                          </span>
                          <span className="text-[10px] font-medium">New data</span>
                        </span>
                      )}
                    </button>
                  ) : (
                    <Link
                      href="/pricing"
                      title="Upgrade to Pro to unlock Advanced Analytics"
                      className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground opacity-40 transition-opacity hover:opacity-70"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Advanced Analytics
                      <Lock className="h-3 w-3" />
                    </Link>
                  )}
                  {canUseAA && (
                    <div className={`absolute left-0 top-9 z-30 min-w-[260px] origin-top-left rounded-xl border border-border bg-card p-3 shadow-xl transition-all duration-200 ${
                      showAdvancedMenu
                        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none -translate-y-1 scale-95 opacity-0"
                    }`}>
                      <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">AI Analysis</p>
                      <button
                        onClick={runAdvancedAnalytics}
                        disabled={isRunningAnalytics || readinessState.kind === "empty"}
                        className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                          {isRunningAnalytics ? (
                            <><div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> Generating…</>
                          ) : (
                            <><Sparkles className="h-3.5 w-3.5 text-primary" /> Run Advanced Analytics</>
                          )}
                        </span>
                        <span className="mt-0.5 text-xs text-muted-foreground">Generate new AI-powered visualizations</span>
                      </button>
                      <ReadinessHint state={readinessState} />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Color picker — desktop only. Widget selected → widget accent
                override; otherwise → dashboard-wide accent. */}
            {!isMobile && isEditingLayout && (() => {
              const pickerScope: "widget" | "dashboard" = selectedWidget ? "widget" : "dashboard"
              const currentAccent = pickerScope === "widget"
                ? (selectedWidget!.colors?.primary ?? dashboardAccent)
                : dashboardAccent
              const hasOverride = pickerScope === "widget" && !!selectedWidget!.colors?.primary
              const setAccent = (hex: string) => {
                if (pickerScope === "widget") updateWidgetAccent(selectedWidget!.id, hex)
                else updateDashboardAccent(hex)
              }
              return (
                <div
                  className="relative flex items-center gap-1.5"
                  onMouseEnter={cancelColorPickerClose}
                  onMouseLeave={showColorPicker ? scheduleColorPickerClose : undefined}
                >
                  <div className="h-4 w-px bg-border mx-1" />
                  <span className="text-xs text-muted-foreground">
                    {pickerScope === "widget" ? "Widget color:" : "Dashboard color:"}
                  </span>
                  <div className="relative">
                    <button
                      onClick={() => { cancelColorPickerClose(); setShowColorPicker(!showColorPicker) }}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                    >
                      <span className="h-4 w-4 rounded-full border border-white/10" style={{ background: currentAccent }} />
                      <ChevronDown className="h-3 w-3" />
                    </button>
                    <div className={`absolute left-0 top-9 z-30 w-64 origin-top-left rounded-xl border border-border bg-card p-4 shadow-xl transition-all duration-200 ${
                      showColorPicker
                        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none -translate-y-1 scale-95 opacity-0"
                    }`}>
                      <p className="mb-3 text-xs font-medium text-muted-foreground">
                        {pickerScope === "widget" ? "Widget accent" : "Dashboard accent"}
                      </p>
                      <div className="grid grid-cols-8 gap-1.5">
                        {CURATED_ACCENTS.map((hex) => {
                          const isActive = currentAccent.toLowerCase() === hex.toLowerCase()
                          return (
                            <button
                              key={hex}
                              onClick={() => setAccent(hex)}
                              className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${isActive ? "border-foreground ring-2 ring-foreground/20" : "border-white/10"}`}
                              style={{ background: hex }}
                              title={hex}
                            />
                          )
                        })}
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <label className="flex flex-1 items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground">
                          <span>Custom</span>
                          <input
                            type="color"
                            value={currentAccent}
                            onChange={(e) => setAccent(e.target.value)}
                            className="h-5 w-8 cursor-pointer border-0 bg-transparent p-0"
                          />
                          <span className="ml-auto font-mono text-[10px] uppercase">{currentAccent}</span>
                        </label>
                      </div>
                      {hasOverride && (
                        <button
                          onClick={() => { clearWidgetColors(selectedWidget!.id); setShowColorPicker(false) }}
                          className="mt-3 w-full rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                        >
                          Reset to dashboard accent
                        </button>
                      )}
                    </div>
                  </div>
                  {selectedWidget && (
                    <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                      {selectedWidget.title}
                    </span>
                  )}
                </div>
              )
            })()}

            {/* Chart type picker — desktop only */}
            {!isMobile && isEditingLayout && selectedWidget && CHART_TYPE_OPTIONS[selectedWidget.type] && (
              <div className="flex items-center gap-1">
                <div className="h-4 w-px bg-border mx-1" />
                <span className="text-xs text-muted-foreground">Chart:</span>
                <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
                  {CHART_TYPE_OPTIONS[selectedWidget.type].map(opt => {
                    const active = (selectedWidget.chartVariant ?? CHART_DEFAULT[selectedWidget.type]) === opt.value
                    return (
                      <button
                        key={opt.value}
                        onClick={() => updateWidgetChartVariant(selectedWidget.id, opt.value)}
                        className={`rounded px-2 py-0.5 text-xs transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Desktop only — save layout controls */}
            {!isMobile && <>
              <span className={`text-xs font-medium ${isEditingLayout ? "text-primary" : "text-muted-foreground"}`}>
                {savedConfirm ? "Saved / Locked" : isEditingLayout ? (isDirty ? "Editing · Unsaved" : "Editing") : "Saved / Locked"}
              </span>
              <button
                onClick={() => {
                  if (!isEditingLayout) {
                    setIsEditingLayout(true)
                    setShowWidgetPanel(true)
                    return
                  }
                  if (isDirty) {
                    void saveLayout()
                    return
                  }
                  setIsEditingLayout(false)
                  setSelectedWidgetId(null)
                  setShowColorPicker(false)
                  setShowAdvancedMenu(false)
                  setShowDateFilter(false)
                }}
                disabled={isSaving}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-all ${
                  !isEditingLayout
                    ? "border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                    : isDirty
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-border text-primary hover:bg-primary/5"
                }`}
              >
                {savedConfirm ? <><Check className="h-3.5 w-3.5" /> Saved</>
                  : isSaving ? <><div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> Saving…</>
                  : !isEditingLayout ? <><LayoutGrid className="h-3.5 w-3.5" /> Edit Layout</>
                  : isDirty ? <><Save className="h-3.5 w-3.5" /> Save Layout</>
                  : <><Lock className="h-3.5 w-3.5" /> Lock Layout</>}
              </button>
            </>}
          </div>
        </div>

        {/* CANVAS + PANEL */}
        <div className="relative flex-1 overflow-hidden">

          {/* CANVAS — full width, panel overlays on top */}
          <div
            ref={canvasRef}
            className="absolute inset-0 overflow-y-auto p-4"
            style={{
              backgroundColor: "hsl(var(--background))",
              backgroundImage: "radial-gradient(circle, hsl(var(--muted-foreground) / 0.2) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
            onClick={(e) => { if (e.target === e.currentTarget) { setSelectedWidgetId(null); setShowColorPicker(false); setShowDateFilter(false); setShowAdvancedMenu(false) } }}
          >
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Loading your data…</p>
                </div>
              </div>
            ) : (
              <>
              {currencyModel.hasMultipleCurrencies && (
                <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                  {currencyModel.convertedBucket
                    ? `Multiple currencies detected. Aggregate analytics are converted to ${currencyModel.primaryCurrency} using ${currencyModel.fx?.source ?? "Frankfurter"}${currencyModel.fx?.date ? ` reference rates from ${currencyModel.fx.date}` : " reference rates"}. Tax and deductible views stay on native primary-currency data.`
                    : `Multiple currencies detected. Some aggregate analytics use your primary currency (${currencyModel.primaryCurrency}); FX conversion is unavailable${currencyModel.fx?.missingCurrencies?.length ? ` for ${currencyModel.fx.missingCurrencies.join(", ")}` : ""}.`}
                </div>
              )}
              <GridLayout
                className="layout"
                layout={resolvedLayout}
                cols={12}
                rowHeight={24}
                width={containerWidth}
                onLayoutChange={handleLayoutChange}
                draggableHandle={isMobile ? ".no-drag" : ".drag-handle"}
                isDraggable={!isMobile && isEditingLayout}
                isResizable={!isMobile && isEditingLayout}
                margin={[10, 10]}
                containerPadding={[0, 0]}
                resizeHandles={isMobile ? [] : ["se", "sw", "ne", "nw", "e", "w", "s"]}
              >
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    onClick={isMobile || !isEditingLayout ? undefined : (e) => { e.stopPropagation(); setSelectedWidgetId(widget.id); setShowColorPicker(false); setShowDateFilter(false); setContextMenu(null) }}
                    onContextMenu={isMobile || !isEditingLayout ? undefined : (e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, widgetId: widget.id }) }}
                    className={`group relative flex flex-col rounded-2xl border bg-card shadow-sm transition-all ${
                      isMobile
                        ? "border-border"
                        : isEditingLayout && selectedWidgetId === widget.id
                          ? "border-primary ring-2 ring-primary/20 cursor-pointer"
                          : isEditingLayout
                            ? "cursor-pointer border-border hover:border-border/60 hover:shadow-md"
                            : "border-border"
                    }`}
                  >
                    {/* Corner grid markers — desktop selected state only */}
                    {!isMobile && isEditingLayout && selectedWidgetId === widget.id && (<>
                      <span className="pointer-events-none absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    </>)}

                    {/* Drag handle — desktop only */}
                    {!isMobile && isEditingLayout && <div className="drag-handle absolute left-0 right-0 top-0 h-8 cursor-grab rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-100" />}

                    {/* Widget header */}
                    <div className="flex items-center px-4 pt-3 pb-1 shrink-0">
                      <h3 className="text-xs font-semibold text-foreground">{displayWidgetTitle(widget, currencyModel)}</h3>
                    </div>

                    {/* Widget content */}
                    <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3">
                      <WidgetContent
                        widget={widget}
                        kpi={kpi}
                        monthlyData={monthlyData}
                        categoryData={categoryData}
                        docTypeData={docTypeData}
                        stackedCompositionData={stackedCompositionData}
                        composedData={composedData}
                        bandedSpendData={bandedSpendData}
                        currencyModel={currencyModel}
                        dashboardAccent={dashboardAccent}
                        contextSummary={contextSummary}
                        contextSummaryDate={contextSummaryDate}
                        isGeneratingSummary={isGeneratingSummary}
                        isPro={isPro}
                        onGenerateSummary={generateContextSummary}
                      />
                    </div>

                    {/* AI insight strip — only on advanced widgets */}
                    {widget.insight && (
                      <div className="shrink-0 mx-4 mb-3 flex items-start gap-1.5 rounded-lg bg-primary/5 px-2.5 py-2">
                        <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                        <p className="text-xs leading-snug text-muted-foreground">{widget.insight}</p>
                      </div>
                    )}
                  </div>
                ))}
              </GridLayout>
              </>
            )}

            {/* Right-click context menu — desktop only */}
            {!isMobile && contextMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
                <div
                  className="fixed z-50 min-w-[150px] rounded-xl border border-border bg-card py-1 shadow-xl"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                  <button
                    onClick={() => { removeWidget(contextMenu.widgetId); setContextMenu(null) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive transition-colors hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                    Remove widget
                  </button>
                </div>
              </>
            )}

            {/* Analytics toast notification */}
            {analyticsToast && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xl">
                <Sparkles className="h-4 w-4 flex-shrink-0 text-primary" />
                <p className="text-sm text-foreground">{analyticsToast}</p>
                <button
                  onClick={() => setAnalyticsToast(null)}
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* PANEL TOGGLE TAB — desktop only */}
          <button
            onClick={() => setShowWidgetPanel(v => !v)}
            className="hidden md:flex absolute top-1/2 right-0 z-20 h-20 w-8 -translate-y-1/2 items-center justify-center rounded-l-xl border border-r-0 border-border bg-card/95 text-primary shadow-lg transition-all hover:bg-card hover:text-primary hover:[box-shadow:0_0_26px_-4px_var(--retro-glow-red)]"
            title={showWidgetPanel ? "Hide panel" : "Show panel"}
          >
            <PanelRight className={`h-4 w-4 drop-shadow-[0_0_12px_var(--retro-glow-red)] transition-transform duration-300 ${showWidgetPanel ? "rotate-180" : "rotate-0"}`} />
          </button>

          {/* VISUALIZATIONS PANEL — desktop absolute overlay */}
          <aside className={`hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-72 flex-col overflow-hidden border-l border-border bg-card/95 backdrop-blur-sm shadow-xl transition-all duration-300 ease-out ${
            showWidgetPanel ? "translate-x-0 opacity-100 pointer-events-auto" : "translate-x-full opacity-0 pointer-events-none"
          }`}>
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Visualizations</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Add visualizations to your dashboard</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3">

              {/* Standard section — collapsible */}
              <button
                onClick={() => setStandardOpen(v => !v)}
                className="flex w-full items-center justify-between px-1 mb-2"
              >
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
                <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${standardOpen ? "rotate-90" : ""}`} />
              </button>
              {standardOpen && (
                <div className="space-y-1 mb-3">
                  {WIDGET_LIBRARY.filter(w => !w.isPremium).map((item) => {
                    const added = widgets.some(w => w.type === item.type)
                    return (
                      <button
                        key={item.type}
                        onClick={() => addWidget(item.type, item.title, false)}
                        disabled={added || !isEditingLayout}
                        className={`flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${added || !isEditingLayout ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                      >
                        <div className="flex-1 min-w-0 pr-2">
                          <p className={`text-sm font-medium leading-tight ${added ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                        </div>
                        {added ? <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              )}

              <>
                  <div className="my-2 h-px bg-border" />

                  {/* Advanced section — collapsible */}
                  <button
                    onClick={() => setAdvancedOpen(v => !v)}
                    className="flex w-full items-center justify-between px-1 mb-2"
                  >
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced</p>
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
                  </button>
                  {advancedOpen && (
                    <div className="space-y-1">
                      {/* Context Summary — always first. Locked upsell for non-pro. */}
                      {(() => {
                        const item = WIDGET_LIBRARY.find(w => w.type === "context-summary")!
                        const added = widgets.some(w => w.type === item.type)
                        if (!isPro) {
                          return (
                            <Link
                              key={item.type}
                              href="/pricing"
                              title="Upgrade to Pro to unlock Context Summary"
                              className="flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left opacity-40 transition-opacity hover:opacity-70"
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <p className="text-sm font-medium leading-tight text-foreground flex items-center gap-1.5">{item.title}<Lock className="h-3 w-3" /></p>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                              </div>
                            </Link>
                          )
                        }
                        return (
                          <button
                            key={item.type}
                            onClick={() => addWidget(item.type, item.title, true)}
                            disabled={added || !isEditingLayout}
                            className={`flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${added || !isEditingLayout ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className={`text-sm font-medium leading-tight ${added ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                            </div>
                            {added ? <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                          </button>
                        )
                      })()}

                      {/* AI-generated widgets — starred first, then chronological */}
                      {isPro && advancedWidgetsList.length > 0 && <div className="my-1 h-px bg-border/50" />}
                      {isPro && advancedWidgetsList.map((aw) => {
                        const plotted = widgets.some(w => w.advancedId === aw.id)
                        return (
                          <div key={aw.id} className="group flex w-full items-start gap-1 rounded-lg px-2 py-2 hover:bg-muted">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-tight text-foreground truncate">{aw.title}</p>
                              {aw.insight && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{aw.insight}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                              <button
                                onClick={() => toggleStarAdvancedWidget(aw)}
                                disabled={!isEditingLayout}
                                className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-yellow-400 disabled:cursor-not-allowed disabled:opacity-40 ${aw.is_starred ? "text-yellow-400" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                                title={aw.is_starred ? "Unpin" : "Pin"}
                              >
                                <Star className={`h-3 w-3 ${aw.is_starred ? "fill-current" : ""}`} />
                              </button>
                              <button
                                onClick={() => plotAdvancedWidget(aw)}
                                disabled={plotted || !isEditingLayout}
                                className={`flex h-5 w-5 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${plotted ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"}`}
                                title={plotted ? "On canvas" : "Add to canvas"}
                              >
                                {plotted ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {isPro && advancedWidgetsList.length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground italic">Run Advanced Analytics to generate visualizations</p>
                      )}
                    </div>
                  )}
                </>

              {!isPro && (
                <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-medium text-foreground">Pro Plan</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Unlock AI-powered Context Summary and Advanced Analytics.
                  </p>
                  <Link href="/pricing">
                    <Button size="sm" className="w-full rounded-lg text-xs">Upgrade to Pro</Button>
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>

      {/* MOBILE — Visualizations sheet */}
      <Sheet open={mobileWidgetPanelOpen} onOpenChange={setMobileWidgetPanelOpen}>
        <SheetContent side="right" className="w-80 p-0 flex flex-col gap-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Visualizations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Add visualizations to your dashboard</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">

            {/* Standard section */}
            <button
              onClick={() => setStandardOpen(v => !v)}
              className="flex w-full items-center justify-between px-1 mb-2"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
              <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${standardOpen ? "rotate-90" : ""}`} />
            </button>
            {standardOpen && (
              <div className="space-y-1 mb-3">
                {WIDGET_LIBRARY.filter(w => !w.isPremium).map((item) => {
                  const added = widgets.some(w => w.type === item.type)
                  return (
                    <button
                      key={item.type}
                      onClick={() => { addWidget(item.type, item.title, false); setMobileWidgetPanelOpen(false) }}
                      disabled={added}
                      className={`flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${added ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                    >
                      <div className="flex-1 min-w-0 pr-2">
                        <p className={`text-sm font-medium leading-tight ${added ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                      </div>
                      {added ? <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}

            <>
                <div className="my-2 h-px bg-border" />
                <button
                  onClick={() => setAdvancedOpen(v => !v)}
                  className="flex w-full items-center justify-between px-1 mb-2"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Advanced</p>
                  <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${advancedOpen ? "rotate-90" : ""}`} />
                </button>
                {advancedOpen && (
                  <div className="space-y-1">
                    {(() => {
                      const item = WIDGET_LIBRARY.find(w => w.type === "context-summary")!
                      const added = widgets.some(w => w.type === item.type)
                      if (!isPro) {
                        return (
                          <Link
                            key={item.type}
                            href="/pricing"
                            onClick={() => setMobileWidgetPanelOpen(false)}
                            className="flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left opacity-40 transition-opacity hover:opacity-70"
                          >
                            <div className="flex-1 min-w-0 pr-2">
                              <p className="text-sm font-medium leading-tight text-foreground flex items-center gap-1.5">{item.title}<Lock className="h-3 w-3" /></p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                            </div>
                          </Link>
                        )
                      }
                      return (
                        <button
                          key={item.type}
                          onClick={() => { addWidget(item.type, item.title, true); setMobileWidgetPanelOpen(false) }}
                          disabled={added}
                          className={`flex w-full items-start justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${added ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                        >
                          <div className="flex-1 min-w-0 pr-2">
                            <p className={`text-sm font-medium leading-tight ${added ? "text-muted-foreground" : "text-foreground"}`}>{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{item.desc}</p>
                          </div>
                          {added ? <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />}
                        </button>
                      )
                    })()}
                    {isPro && advancedWidgetsList.length > 0 && <div className="my-1 h-px bg-border/50" />}
                    {isPro && advancedWidgetsList.map((aw) => {
                      const plotted = widgets.some(w => w.advancedId === aw.id)
                      return (
                        <div key={aw.id} className="group flex w-full items-start gap-1 rounded-lg px-2 py-2 hover:bg-muted">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight text-foreground truncate">{aw.title}</p>
                            {aw.insight && <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{aw.insight}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <button
                              onClick={() => toggleStarAdvancedWidget(aw)}
                              className={`flex h-5 w-5 items-center justify-center rounded transition-colors hover:text-yellow-400 ${aw.is_starred ? "text-yellow-400" : "text-muted-foreground"}`}
                            >
                              <Star className={`h-3 w-3 ${aw.is_starred ? "fill-current" : ""}`} />
                            </button>
                            <button
                              onClick={() => { plotAdvancedWidget(aw); setMobileWidgetPanelOpen(false) }}
                              disabled={plotted}
                              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${plotted ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                            >
                              {plotted ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                    {isPro && advancedWidgetsList.length === 0 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground italic">Run Advanced Analytics to generate visualizations</p>
                    )}
                  </div>
                )}
              </>

            {!isPro && (
              <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-medium text-foreground">Pro Plan</p>
                </div>
                <p className="text-xs text-muted-foreground mb-2">Unlock AI-powered Context Summary and Advanced Analytics.</p>
                <Link href="/pricing">
                  <Button size="sm" className="w-full rounded-lg text-xs">Upgrade to Pro</Button>
                </Link>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}
