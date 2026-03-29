"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import { motion, AnimatePresence } from "framer-motion"
import GridLayout from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, Receipt, Wallet, FileText,
  Save, Calendar, ChevronDown, Lock, Sparkles,
  LayoutGrid, X, Check, Plus, Zap
} from "lucide-react"
import { Button } from "@/components/ui/button"

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
  { id: "kpi-income",   type: "kpi-income",   title: "Total Income" },
  { id: "kpi-expenses", type: "kpi-expenses",  title: "Total Expenses" },
  { id: "kpi-net",      type: "kpi-net",       title: "Net Position" },
  { id: "kpi-docs",     type: "kpi-docs",      title: "Documents" },
  { id: "area-chart",   type: "area-chart",    title: "Income vs Expenses" },
  { id: "bar-chart",    type: "bar-chart",     title: "Expenses by Category" },
  { id: "pie-chart",    type: "pie-chart",     title: "Document Distribution" },
]

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: "kpi-income",   x: 0, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-expenses", x: 3, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-net",      x: 6, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "kpi-docs",     x: 9, y: 0, w: 3, h: 2, minW: 2, minH: 2 },
  { i: "area-chart",   x: 0, y: 2, w: 12, h: 5, minW: 4, minH: 3 },
  { i: "bar-chart",    x: 0, y: 7, w: 6, h: 5, minW: 3, minH: 3 },
  { i: "pie-chart",    x: 6, y: 7, w: 6, h: 5, minW: 3, minH: 3 },
]

const WIDGET_LIBRARY = [
  { type: "kpi-income",         title: "Income KPI",           isPremium: false },
  { type: "kpi-expenses",       title: "Expenses KPI",         isPremium: false },
  { type: "kpi-net",            title: "Net Position KPI",     isPremium: false },
  { type: "kpi-docs",           title: "Document Count KPI",   isPremium: false },
  { type: "area-chart",         title: "Income vs Expenses",   isPremium: false },
  { type: "bar-chart",          title: "Category Breakdown",   isPremium: false },
  { type: "pie-chart",          title: "Doc Distribution",     isPremium: false },
  { type: "context-summary",    title: "Context Summary",      isPremium: true  },
  { type: "advanced-analytics", title: "Advanced Analytics",   isPremium: true  },
]

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
}: {
  widget: Widget
  kpi: KPIData
  monthlyData: MonthlyData[]
  categoryData: CategoryData[]
  docTypeData: CategoryData[]
}) {
  const symbol = kpi.currency === "PHP" ? "₱" : "$"
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

  if (widget.type === "area-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-xs text-muted-foreground">Monthly income vs expenses from your documents</p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`incomeGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.primary} stopOpacity={0.25} />
                <stop offset="95%" stopColor={colors.primary} stopOpacity={0} />
              </linearGradient>
              <linearGradient id={`expenseGrad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.secondary} stopOpacity={0.2} />
                <stop offset="95%" stopColor={colors.secondary} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip symbol={symbol} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
            <Area type="monotone" dataKey="income" name="Income" stroke={colors.primary} strokeWidth={2.5} fill={`url(#incomeGrad-${widget.id})`} dot={{ fill: colors.primary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
            <Area type="monotone" dataKey="expenses" name="Expenses" stroke={colors.secondary} strokeWidth={2.5} fill={`url(#expenseGrad-${widget.id})`} dot={{ fill: colors.secondary, r: 3, strokeWidth: 0 }} activeDot={{ r: 5, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "bar-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-xs text-muted-foreground">Total spend per category</p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip symbol={symbol} />} />
            <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]}>
              {categoryData.map((_, i) => (
                <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "pie-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs text-muted-foreground">Breakdown by document type</p>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={docTypeData} cx="50%" cy="50%" innerRadius="35%" outerRadius="60%" paddingAngle={3} dataKey="value">
              {docTypeData.map((_, i) => (
                <Cell key={i} fill={MULTI_COLORS[i % MULTI_COLORS.length]} strokeWidth={0} />
              ))}
            </Pie>
            <Tooltip formatter={(v: any, n: any) => [v, n]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "hsl(var(--foreground))" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "context-summary" || widget.type === "advanced-analytics") {
    const isAdvanced = widget.type === "advanced-analytics"
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: colors.primary + "20" }}>
          {isAdvanced
            ? <Sparkles className="h-5 w-5" style={{ color: colors.primary }} />
            : <FileText className="h-5 w-5" style={{ color: colors.primary }} />
          }
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{widget.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">Available on Pro plan</p>
        </div>
        <Button size="sm" variant="outline" className="rounded-lg text-xs" disabled>
          Upgrade to unlock
        </Button>
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
  const [kpi, setKpi] = useState<KPIData>({ totalIncome: 0, totalExpenses: 0, netPosition: 0, documentCount: 0, savingsRate: 0, currency: "PHP" })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [docTypeData, setDocTypeData] = useState<CategoryData[]>([])
  const [widgets, setWidgets] = useState<Widget[]>(DEFAULT_WIDGETS)
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState(false)
  const [showWidgetPanel, setShowWidgetPanel] = useState(false)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [hasNewData, setHasNewData] = useState(false)
  const [containerWidth, setContainerWidth] = useState(1200)
  const canvasRef = useRef<HTMLDivElement>(null)

  const selectedWidget = widgets.find(w => w.id === selectedWidgetId)

  // ── Measure canvas width ───────────────────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      if (canvasRef.current) setContainerWidth(canvasRef.current.offsetWidth - 48)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (canvasRef.current) observer.observe(canvasRef.current)
    window.addEventListener("resize", measure)
    return () => {
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
      if (saved.gridLayout?.length) setLayout(saved.gridLayout)
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

    const currency = (fields[0] as any)?.currency ?? "PHP"
    const incomeFields = fields.filter((f: any) => ["payslip", "income_statement"].includes(f.files.document_type))
    const expenseFields = fields.filter((f: any) => ["receipt", "invoice"].includes(f.files.document_type))

    const totalIncome = incomeFields.reduce((s: number, f: any) => s + parseFloat(f.gross_income ?? f.total_amount ?? 0), 0)
    const totalExpenses = expenseFields.reduce((s: number, f: any) => s + parseFloat(f.total_amount ?? 0), 0)
    const netPosition = totalIncome - totalExpenses

    setKpi({ totalIncome, totalExpenses, netPosition, documentCount: userFiles.length, savingsRate: totalIncome > 0 ? (netPosition / totalIncome) * 100 : 0, currency })

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

    // Check for new data (simple heuristic — any fields without analytics run)
    setHasNewData(fields.length > 0)

    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadLayout() }, [loadLayout])
  useEffect(() => { loadData() }, [loadData])

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
    if (isPremium) return
    if (widgets.some(w => w.type === type)) return
    const id = `${type}-${Date.now()}`
    const isKpi = type.startsWith("kpi")
    setWidgets(prev => [...prev, { id, type, title }])
    setLayout(prev => [...prev, { i: id, x: 0, y: Infinity, w: isKpi ? 3 : 6, h: isKpi ? 2 : 5, minW: isKpi ? 2 : 3, minH: isKpi ? 2 : 3 }])
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

  const handleLayoutChange = (newLayout: any[]) => {
    setLayout(newLayout.map(l => ({ i: l.i, x: l.x, y: l.y, w: l.w, h: l.h, minW: l.minW, minH: l.minH })))
    setIsDirty(true)
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  const symbol = kpi.currency === "PHP" ? "₱" : "$"

  return (
    <div className="flex min-h-screen flex-col">
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
                    {[
                      { label: "All time", from: "", to: "" },
                      { label: "This year", from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().slice(0,10) },
                      { label: "Last 90 days", from: new Date(Date.now()-90*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
                      { label: "Last 30 days", from: new Date(Date.now()-30*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
                    ].map(p => (
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

            {/* Advanced Analytics — conditional */}
            <button className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted" disabled>
              <Sparkles className="h-3.5 w-3.5" />
              Advanced Analytics
              <Lock className="h-3 w-3" />
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
            <button
              onClick={() => setShowWidgetPanel(!showWidgetPanel)}
              className={`flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-muted ${showWidgetPanel ? "bg-muted text-foreground" : "text-muted-foreground"}`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Widgets
            </button>
          </div>
        </div>

        {/* CANVAS + RIGHT PANEL */}
        <div className="flex flex-1 overflow-hidden">

          {/* CANVAS */}
          <div
            ref={canvasRef}
            className="min-w-0 flex-1 overflow-y-auto bg-muted/20 p-6"
            onClick={(e) => { if (e.target === e.currentTarget) { setSelectedWidgetId(null); setShowColorPicker(false); setShowDateFilter(false) } }}
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
                rowHeight={60}
                width={containerWidth}
                onLayoutChange={handleLayoutChange}
                draggableHandle=".drag-handle"
                margin={[16, 16]}
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
                    {/* Drag handle */}
                    <div className="drag-handle absolute left-0 right-0 top-0 h-8 cursor-grab rounded-t-2xl opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Widget header */}
                    <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
                      <h3 className="text-sm font-semibold text-foreground">{widget.title}</h3>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeWidget(widget.id) }}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>

                    {/* Widget content */}
                    <div className="flex-1 min-h-0 px-5 pb-4">
                      <WidgetContent
                        widget={widget}
                        kpi={kpi}
                        monthlyData={monthlyData}
                        categoryData={categoryData}
                        docTypeData={docTypeData}
                      />
                    </div>
                  </div>
                ))}
              </GridLayout>
            )}
          </div>

          {/* RIGHT PANEL */}
          <AnimatePresence>
            {showWidgetPanel && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex shrink-0 flex-col overflow-hidden border-l border-border bg-card"
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold text-foreground">Widget Library</h2>
                  <button onClick={() => setShowWidgetPanel(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Standard</p>
                  <div className="space-y-0.5">
                    {WIDGET_LIBRARY.filter(w => !w.isPremium).map((item) => {
                      const added = widgets.some(w => w.type === item.type)
                      return (
                        <button
                          key={item.type}
                          onClick={() => addWidget(item.type, item.title, false)}
                          disabled={added}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${added ? "text-muted-foreground/40 cursor-not-allowed" : "text-foreground hover:bg-muted"}`}
                        >
                          <span>{item.title}</span>
                          {added ? <Check className="h-3.5 w-3.5 text-primary" /> : <Plus className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>
                      )
                    })}
                  </div>

                  <div className="my-3 h-px bg-border" />

                  <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Advanced</p>
                  <div className="space-y-0.5">
                    {WIDGET_LIBRARY.filter(w => w.isPremium).map((item) => (
                      <div key={item.type} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/40">
                        <span>{item.title}</span>
                        <Lock className="h-3.5 w-3.5" />
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium text-foreground">Pro Plan</p>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      Unlock AI-powered Context Summary and Advanced Analytics widgets.
                    </p>
                    <Button size="sm" className="w-full rounded-lg text-xs" disabled>
                      Upgrade to Pro
                    </Button>
                  </div>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Footer />
    </div>
  )
}
