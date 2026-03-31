"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import GridLayout from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, Receipt, Wallet, FileText,
  Save, Calendar, ChevronDown, Lock, Sparkles,
  LayoutGrid, X, Check, Plus, Zap, PanelRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

// ── Types ─────────────────────────────────────────────────────────────────────

interface WidgetColor {
  primary: string
  secondary: string
  tertiary: string
  quaternary: string
  quinary: string
}

interface Widget {
  id: string
  type: string
  title: string
  isPremium?: boolean
  colors?: WidgetColor
  chartVariant?: string
}

interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
}

interface KPIData {
  totalIncome: number
  totalExpenses: number
  netPosition: number
  documentCount: number
  savingsRate: number
  taxExposure: number
  taxRatio: number
  currency: string
}

interface MonthlyData { month: string; expenses: number; income: number }
interface CategoryData { name: string; value: number }

// ── Default colors ────────────────────────────────────────────────────────────

const DEFAULT_WIDGET_COLORS: WidgetColor = {
  primary: "#6366f1",
  secondary: "#ef4444",
  tertiary: "#f59e0b",
  quaternary: "#10b981",
  quinary: "#8b5cf6",
}

const COLOR_PRESETS: WidgetColor[] = [
  { primary: "#6366f1", secondary: "#ef4444", tertiary: "#f59e0b", quaternary: "#10b981", quinary: "#8b5cf6" },
  { primary: "#10b981", secondary: "#f59e0b", tertiary: "#3b82f6", quaternary: "#ec4899", quinary: "#06b6d4" },
  { primary: "#3b82f6", secondary: "#ec4899", tertiary: "#f97316", quaternary: "#84cc16", quinary: "#8b5cf6" },
  { primary: "#8b5cf6", secondary: "#06b6d4", tertiary: "#f59e0b", quaternary: "#ef4444", quinary: "#10b981" },
  { primary: "#f97316", secondary: "#84cc16", tertiary: "#3b82f6", quaternary: "#ec4899", quinary: "#6366f1" },
]

// ── Default layout ────────────────────────────────────────────────────────────

const DEFAULT_WIDGETS: Widget[] = [
  { id: "kpi-income",      type: "kpi-income",      title: "Total Income" },
  { id: "kpi-expenses",    type: "kpi-expenses",     title: "Total Expenses" },
  { id: "kpi-net",         type: "kpi-net",          title: "Net Position" },
  { id: "kpi-docs",        type: "kpi-docs",         title: "Documents" },
  { id: "kpi-tax-exposure",type: "kpi-tax-exposure", title: "Est. Tax Exposure" },
  { id: "kpi-tax-ratio",   type: "kpi-tax-ratio",    title: "Tax Burden Rate" },
  { id: "area-chart",      type: "area-chart",       title: "Income vs Expenses" },
  { id: "bar-chart",       type: "bar-chart",        title: "Expenses by Category" },
  { id: "bar-deductible",  type: "bar-deductible",   title: "Deductible Expenses" },
  { id: "pie-chart",       type: "pie-chart",        title: "Document Distribution" },
]

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "kpi-income",       x: 0,  y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "kpi-expenses",     x: 2,  y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "kpi-net",          x: 4,  y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "kpi-docs",         x: 6,  y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "kpi-tax-exposure", x: 8,  y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "kpi-tax-ratio",    x: 10, y: 0,  w: 2, h: 5,  minW: 2, minH: 1 },
  { i: "area-chart",       x: 0,  y: 5,  w: 12, h: 12, minW: 4, minH: 3 },
  { i: "bar-chart",        x: 0,  y: 17, w: 4, h: 11, minW: 3, minH: 3 },
  { i: "bar-deductible",   x: 4,  y: 17, w: 4, h: 11, minW: 3, minH: 3 },
  { i: "pie-chart",        x: 8,  y: 17, w: 4, h: 11, minW: 3, minH: 3 },
]

const WIDGET_LIBRARY = [
  { type: "kpi-income",       title: "Income KPI",          desc: "Total income detected across all documents",           isPremium: false },
  { type: "kpi-expenses",     title: "Expenses KPI",        desc: "Sum of all classified expense transactions",           isPremium: false },
  { type: "kpi-net",          title: "Net Position KPI",    desc: "Income minus expenses with savings rate",              isPremium: false },
  { type: "kpi-docs",         title: "Document Count KPI",  desc: "Number of financial documents processed",             isPremium: false },
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

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, symbol }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-sm font-medium" style={{ color: entry.color }}>
          {entry.name}: {symbol}{entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  )
}

// ── Widget content ────────────────────────────────────────────────────────────

function WidgetContent({
  widget, kpi, monthlyData, categoryData, docTypeData,
  contextSummary, contextSummaryDate, isGeneratingSummary, isPro, onGenerateSummary,
}: {
  widget: Widget
  kpi: KPIData
  monthlyData: MonthlyData[]
  categoryData: CategoryData[]
  docTypeData: CategoryData[]
  contextSummary: string | null
  contextSummaryDate: string | null
  isGeneratingSummary: boolean
  isPro: boolean
  onGenerateSummary: () => void
}) {
  const symbol = kpi.currency === "PHP" ? "₱" : kpi.currency === "EUR" ? "€" : kpi.currency === "GBP" ? "£" : "$"
  const colors = widget.colors ?? DEFAULT_WIDGET_COLORS
  const MULTI_COLORS = [colors.primary, colors.secondary, colors.tertiary, colors.quaternary, colors.quinary]

  if (widget.type === "kpi-income") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Income</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.primary + "20" }}>
          <TrendingUp className="h-4 w-4" style={{ color: colors.primary }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedNumber value={kpi.totalIncome} prefix={symbol} />
      </p>
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
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedNumber value={kpi.totalExpenses} prefix={symbol} />
      </p>
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
      <p className="text-xs text-muted-foreground">{kpi.savingsRate.toFixed(1)}% savings rate</p>
    </div>
  )

  if (widget.type === "kpi-docs") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Documents</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: colors.primary + "20" }}>
          <FileText className="h-4 w-4" style={{ color: colors.primary }} />
        </div>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
        <AnimatedNumber value={kpi.documentCount} />
      </p>
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

  if (widget.type === "area-chart") {
    const variant = widget.chartVariant ?? "area"
    const axisProps = {
      xAxis: <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />,
      yAxis: <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />,
      grid: <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />,
      tooltip: <Tooltip content={<CustomTooltip symbol={symbol} />} />,
      legend: <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />,
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

  if (widget.type === "bar-chart" || widget.type === "bar-deductible") {
    const variant = widget.chartVariant ?? "bar"
    const data = categoryData
    const label = widget.type === "bar-deductible" ? "Expense categories reducing tax exposure" : "Total spend per category"
    return (
      <div className="flex h-full flex-col">
        <p className="mb-3 text-xs text-muted-foreground">{label}</p>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            {variant === "pie" ? (
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius="30%" outerRadius="60%" paddingAngle={3} dataKey="value">
                  {data.map((_, i) => <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip formatter={(v: any, n: any) => [v, n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
              </PieChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${symbol}${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip symbol={symbol} />} />
                <Bar dataKey="value" name={widget.type === "bar-deductible" ? "Deductible" : "Amount"} radius={[6, 6, 0, 0]}>
                  {data.map((_, i) => <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} />)}
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
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                {docTypeData.map((_, i) => <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} />)}
              </Bar>
            </BarChart>
          ) : (
          <PieChart>
            <Pie data={docTypeData} cx="50%" cy="50%" innerRadius="35%" outerRadius="60%" paddingAngle={3} dataKey="value">
              {docTypeData.map((_, i) => (
                <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, n: any) => [v, n]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
          </PieChart>
          )}
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartDashboardPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<KPIData>({ totalIncome: 0, totalExpenses: 0, netPosition: 0, documentCount: 0, savingsRate: 0, taxExposure: 0, taxRatio: 0, currency: "PHP" })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [docTypeData, setDocTypeData] = useState<CategoryData[]>([])
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState(false)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false)
  const [showWidgetPanel, setShowWidgetPanel] = useState(true)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [hasNewData, setHasNewData] = useState(false)
  const [isPro, setIsPro] = useState(false)
  const [containerWidth, setContainerWidth] = useState(1200)
  const [contextSummary, setContextSummary] = useState<string | null>(null)
  const [contextSummaryDate, setContextSummaryDate] = useState<string | null>(null)
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false)
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

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
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("layout")
      .eq("user_id", session.user.id)
      .single()
    if (data?.layout) {
      const saved = data.layout
      if (saved.widgets?.length) setWidgets(saved.widgets)
      if (saved.gridLayout?.length) {
        // Always apply current minH/minW — never restore stale saved constraints
        const constraints: Record<string, { minW: number; minH: number }> = {}
        DEFAULT_LAYOUT.forEach(l => { constraints[l.i] = { minW: l.minW ?? 2, minH: l.minH ?? 1 } })
        setLayout(saved.gridLayout.map((l: any) => ({
          i: l.i, x: l.x, y: l.y, w: l.w, h: l.h,
          minW: constraints[l.i]?.minW ?? 2,
          minH: constraints[l.i]?.minH ?? 1,
        })))
      }
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
      .select("file_id, document_date, total_amount, gross_income, net_income, expense_category, currency, files!inner(document_type, filename)")
      .in("file_id", fileIds)
      .order("document_date", { ascending: true })

    if (dateFrom) query = query.gte("document_date", dateFrom)
    if (dateTo) query = query.lte("document_date", dateTo)

    const { data: fields } = await query
    if (!fields?.length) { setLoading(false); return }

    const currency = (fields[0] as any)?.currency ?? "USD"
    const incomeFields = fields.filter((f: any) => ["payslip", "income_statement"].includes(f.files.document_type))
    const expenseFields = fields.filter((f: any) => ["receipt", "invoice"].includes(f.files.document_type))

    const totalIncome = incomeFields.reduce((s: number, f: any) => s + parseFloat(f.gross_income ?? f.total_amount ?? 0), 0)
    const totalExpenses = expenseFields.reduce((s: number, f: any) => s + parseFloat(f.total_amount ?? 0), 0)
    const netPosition = totalIncome - totalExpenses

    const taxExposure = Math.max(0, netPosition)
    const taxRatio = totalIncome > 0 ? (taxExposure / totalIncome) * 100 : 0
    setKpi({ totalIncome, totalExpenses, netPosition, documentCount: userFiles.length, savingsRate: totalIncome > 0 ? (netPosition / totalIncome) * 100 : 0, taxExposure, taxRatio, currency })

    const monthMap: Record<string, { expenses: number; income: number }> = {}
    fields.forEach((f: any) => {
      if (!f.document_date) return
      const month = f.document_date.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { expenses: 0, income: 0 }
      if (["payslip", "income_statement"].includes(f.files.document_type))
        monthMap[month].income += parseFloat(f.gross_income ?? f.total_amount ?? 0)
      else monthMap[month].expenses += parseFloat(f.total_amount ?? 0)
    })
    setMonthlyData(Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b)).map(([m, d]) => ({
      month: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }), ...d
    })))

    const catMap: Record<string, number> = {}
    expenseFields.forEach((f: any) => { const cat = f.expense_category ?? "Other"; catMap[cat] = (catMap[cat] ?? 0) + parseFloat(f.total_amount ?? 0) })
    setCategoryData(Object.entries(catMap).sort(([,a],[,b]) => b - a).map(([name, value]) => ({ name, value })))

    const typeMap: Record<string, number> = {}
    userFiles.forEach((f) => { typeMap[f.document_type] = (typeMap[f.document_type] ?? 0) + 1 })
    setDocTypeData(Object.entries(typeMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })))

    // Show "New data" only if user has run Advanced Analytics before AND new docs arrived since
    const lastCountRaw = typeof window !== "undefined" ? localStorage.getItem("aa_last_field_count") : null
    setHasNewData(lastCountRaw !== null && fields.length > parseInt(lastCountRaw))

    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadLayout() }, [loadLayout])
  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    if (!session?.user?.id) return
    supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", session.user.id)
      .single()
      .then(({ data }) => setIsPro(data?.status === "pro" || data?.status === "day_pass"))
  }, [session])

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
      layout: { widgets, gridLayout: layout },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    setIsSaving(false)
    setIsDirty(false)
    setSavedConfirm(true)
    setTimeout(() => setSavedConfirm(false), 2000)
  }

  // ── Widget management ──────────────────────────────────────────────────────
  const addWidget = (type: string, title: string, isPremium: boolean) => {
    if (isPremium && !isPro) return
    if (widgets.some(w => w.type === type)) return
    const id = `${type}-${Date.now()}`
    const isKpi = type.startsWith("kpi")
    const defaultW = isKpi ? 2 : 4
    const defaultH = isKpi ? 3 : 7
    setWidgets(prev => [...prev, { id, type, title }])
    setLayout(prev => [...prev, { i: id, x: 0, y: Infinity, w: isKpi ? 3 : 6, h: isKpi ? 4 : 8, minW: isKpi ? 2 : 3, minH: isKpi ? 1 : 3 }])
    setIsDirty(true)
  }

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id))
    setLayout(prev => prev.filter(l => l.i !== id))
    if (selectedWidgetId === id) setSelectedWidgetId(null)
    setIsDirty(true)
  }

  const updateWidgetColor = (widgetId: string, colors: WidgetColor) => {
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, colors } : w))
    setIsDirty(true)
  }

  const updateWidgetChartVariant = (widgetId: string, variant: string) => {
    setWidgets(prev => prev.map(w => w.id === widgetId ? { ...w, chartVariant: variant } : w))
    setIsDirty(true)
  }

  const handleLayoutChange = (newLayout: any[]) => {
    setLayout(newLayout.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, minW: l.minW, minH: l.minH })))
    setIsDirty(true)
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  const symbol = kpi.currency === "PHP" ? "₱" : kpi.currency === "EUR" ? "€" : kpi.currency === "GBP" ? "£" : "$"

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />

      <div className="flex flex-1 flex-col overflow-hidden">

        {/* TOP TOOLBAR */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
          <div className="flex items-center gap-2">

            {/* Date filter */}
            <div className="relative">
              <button
                onClick={() => { setShowDateFilter(!showDateFilter); setShowColorPicker(false) }}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Calendar className="h-3.5 w-3.5" />
                {dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "All time"}
                <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
              </button>
              {showDateFilter && (
                <div className="absolute left-0 top-9 z-30 rounded-xl border border-border bg-card p-4 shadow-xl">
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
              )}
            </div>

            {/* Chart type picker — only when applicable chart widget selected */}
            {selectedWidget && CHART_TYPE_OPTIONS[selectedWidget.type] && (
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

            {/* Color picker — only when widget selected */}
            {selectedWidget && (
              <div className="relative flex items-center gap-1.5">
                <div className="h-4 w-px bg-border mx-1" />
                <span className="text-xs text-muted-foreground">Color:</span>
                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <div className="flex items-center gap-0.5">
                      {(["primary","secondary","tertiary","quaternary","quinary"] as const).map(k => (
                        <span key={k} className="h-3.5 w-3.5 rounded-full border border-white/10"
                          style={{ background: (selectedWidget.colors ?? DEFAULT_WIDGET_COLORS)[k] }} />
                      ))}
                    </div>
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  {showColorPicker && (
                    <div className="absolute left-0 top-9 z-30 rounded-xl border border-border bg-card p-4 shadow-xl">
                      <p className="mb-3 text-xs font-medium text-muted-foreground">Widget color theme</p>
                      <div className="space-y-2">
                        {COLOR_PRESETS.map((preset, i) => {
                          const isActive = selectedWidget.colors?.primary === preset.primary
                          return (
                            <button
                              key={i}
                              onClick={() => { updateWidgetColor(selectedWidget.id, preset); setShowColorPicker(false) }}
                              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted ${isActive ? "bg-muted" : ""}`}
                            >
                              <div className="flex items-center gap-1">
                                {(["primary","secondary","tertiary","quaternary","quinary"] as const).map(k => (
                                  <span key={k} className="h-4 w-4 rounded-full" style={{ background: preset[k] }} />
                                ))}
                              </div>
                              <span className="text-xs text-foreground">Theme {i + 1}</span>
                              {isActive && <Check className="ml-auto h-3.5 w-3.5 text-primary" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                  {selectedWidget.title}
                </span>
                <div className="h-4 w-px bg-border mx-1" />
              </div>
            )}

            {/* Advanced Analytics — button only, generates widgets */}
            <div className="relative">
              {isPro ? (
                <button
                  onClick={() => { setShowAdvancedMenu(!showAdvancedMenu); setShowColorPicker(false); setShowDateFilter(false) }}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Advanced Analytics
                  {hasNewData && (
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
                <Link href="/pricing">
                  <button className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Advanced Analytics
                    <Lock className="h-3 w-3" />
                  </button>
                </Link>
              )}
              {showAdvancedMenu && isPro && (
                <div className="absolute left-0 top-9 z-30 min-w-[200px] rounded-xl border border-border bg-card p-3 shadow-xl">
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">Generate Analysis</p>
                  <div className="space-y-0.5">
                    {[{ type: "context-summary", title: "Context Summary", desc: "AI overview of your documents" }].map(opt => {
                      const added = widgets.some(w => w.type === opt.type)
                      return (
                        <button
                          key={opt.type}
                          disabled={added}
                          onClick={() => {
                            addWidget(opt.type, opt.title, true)
                            localStorage.setItem("aa_last_field_count", String(999999))
                            setHasNewData(false)
                            setShowAdvancedMenu(false)
                          }}
                          className={`flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors ${added ? "opacity-40 cursor-not-allowed" : "hover:bg-muted"}`}
                        >
                          <span className="text-sm font-medium text-foreground">{opt.title}</span>
                          <span className="text-xs text-muted-foreground">{opt.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
            <button
              onClick={saveLayout}
              disabled={!isDirty || isSaving}
              className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-all ${
                isDirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-border text-muted-foreground opacity-50 cursor-not-allowed"
              }`}
            >
              {savedConfirm ? <><Check className="h-3.5 w-3.5" /> Saved</>
                : isSaving ? <><div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> Saving…</>
                : <><Save className="h-3.5 w-3.5" /> Save Layout</>}
            </button>
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
              <GridLayout
                className="layout"
                layout={layout}
                cols={12}
                rowHeight={24}
                width={containerWidth}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".drag-handle"
                margin={[10, 10]}
                containerPadding={[0, 0]}
                resizeHandles={["se", "sw", "ne", "nw", "e", "w", "s"]}
              >
                {widgets.map((widget) => (
                  <div
                    key={widget.id}
                    onClick={(e) => { e.stopPropagation(); setSelectedWidgetId(widget.id); setShowColorPicker(false); setShowDateFilter(false) }}
                    className={`group relative flex flex-col rounded-2xl border bg-card shadow-sm transition-all cursor-pointer ${
                      selectedWidgetId === widget.id
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border hover:border-border/60 hover:shadow-md"
                    }`}
                  >
                    {/* Corner grid markers — shown when selected */}
                    {selectedWidgetId === widget.id && (<>
                      <span className="pointer-events-none absolute -top-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -top-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-primary" />
                      <span className="pointer-events-none absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-primary" />
                    </>)}

                    {/* Drag handle */}
                    <div className="drag-handle absolute left-0 right-0 top-0 h-8 cursor-grab rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Widget header */}
                    <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
                      <h3 className="text-xs font-semibold text-foreground">{widget.title}</h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeWidget(widget.id) }}
                        className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>

                    {/* Widget content */}
                    <div className="flex-1 min-h-0 overflow-hidden px-4 pb-3">
                      <WidgetContent
                        widget={widget}
                        kpi={kpi}
                        monthlyData={monthlyData}
                        categoryData={categoryData}
                        docTypeData={docTypeData}
                        contextSummary={contextSummary}
                        contextSummaryDate={contextSummaryDate}
                        isGeneratingSummary={isGeneratingSummary}
                        isPro={isPro}
                        onGenerateSummary={generateContextSummary}
                      />
                    </div>
                  </div>
                ))}
              </GridLayout>
            )}
          </div>

          {/* PANEL TOGGLE TAB */}
          <button
            onClick={() => setShowWidgetPanel(v => !v)}
            className="absolute top-1/2 right-0 -translate-y-1/2 z-20 flex h-14 w-5 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground shadow-md hover:text-foreground transition-colors"
            title={showWidgetPanel ? "Hide panel" : "Show panel"}
          >
            <PanelRight className="h-3 w-3" />
          </button>

          {/* WIDGET PANEL — absolute overlay */}
          {showWidgetPanel && (
          <aside className="absolute right-0 top-0 bottom-0 z-10 flex w-72 flex-col overflow-hidden border-l border-border bg-card/95 backdrop-blur-sm shadow-xl">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Widget Library</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Click to add widgets to your dashboard</p>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
              <div className="space-y-1">
                {WIDGET_LIBRARY.filter(w => !w.isPremium).map((item) => {
                  const added = widgets.some(w => w.type === item.type)
                  return (
                    <button
                      key={item.type}
                      onClick={() => addWidget(item.type, item.title, false)}
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

              {isPro && (
                <>
                  <div className="my-3 h-px bg-border" />
                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Advanced</p>
                  <div className="space-y-1">
                    {WIDGET_LIBRARY.filter(w => w.isPremium).map((item) => {
                      const added = widgets.some(w => w.type === item.type)
                      return (
                        <button
                          key={item.type}
                          onClick={() => addWidget(item.type, item.title, true)}
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
                </>
              )}

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
          )}
        </div>
      </div>
    </div>
  )
}
