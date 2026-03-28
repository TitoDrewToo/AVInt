"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import { motion, AnimatePresence } from "framer-motion"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts"
import {
  TrendingUp, TrendingDown, FileText, Wallet, Receipt,
  Plus, Save, Calendar, ChevronDown, Lock, Sparkles,
  LayoutGrid, GripVertical, X, Check
} from "lucide-react"
import { Button } from "@/components/ui/button"

// ── Types ─────────────────────────────────────────────────────────────────────

interface Widget {
  id: string
  type: string
  title: string
  w: number  // grid columns (1-4)
  h: number  // grid rows
  isPremium?: boolean
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

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--primary) / 0.75)",
  "hsl(var(--primary) / 0.55)",
  "hsl(var(--primary) / 0.35)",
  "hsl(var(--primary) / 0.2)",
]

const DEFAULT_WIDGETS: Widget[] = [
  { id: "kpi-income",    type: "kpi-income",    title: "Total Income",    w: 1, h: 1 },
  { id: "kpi-expenses",  type: "kpi-expenses",  title: "Total Expenses",  w: 1, h: 1 },
  { id: "kpi-net",       type: "kpi-net",        title: "Net Position",    w: 1, h: 1 },
  { id: "kpi-docs",      type: "kpi-docs",       title: "Documents",       w: 1, h: 1 },
  { id: "area-chart",    type: "area-chart",     title: "Income vs Expenses", w: 4, h: 2 },
  { id: "bar-chart",     type: "bar-chart",      title: "Expenses by Category", w: 2, h: 2 },
  { id: "pie-chart",     type: "pie-chart",      title: "Document Distribution", w: 2, h: 2 },
]

const WIDGET_LIBRARY = [
  { type: "kpi-income",    title: "Income KPI",           isPremium: false },
  { type: "kpi-expenses",  title: "Expenses KPI",         isPremium: false },
  { type: "kpi-net",       title: "Net Position KPI",     isPremium: false },
  { type: "kpi-docs",      title: "Document Count KPI",   isPremium: false },
  { type: "area-chart",    title: "Income vs Expenses",   isPremium: false },
  { type: "bar-chart",     title: "Category Breakdown",   isPremium: false },
  { type: "pie-chart",     title: "Doc Distribution",     isPremium: false },
  { type: "text-summary",  title: "AI Text Summary",      isPremium: true  },
  { type: "advanced-analytics", title: "Advanced Analytics", isPremium: true },
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

// ── Widget renderer ───────────────────────────────────────────────────────────

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

  if (widget.type === "kpi-income") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Income</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
          <TrendingUp className="h-4 w-4 text-emerald-500" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        <AnimatedNumber value={kpi.totalIncome} prefix={symbol} />
      </p>
    </div>
  )

  if (widget.type === "kpi-expenses") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Expenses</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
          <Receipt className="h-4 w-4 text-red-500" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        <AnimatedNumber value={kpi.totalExpenses} prefix={symbol} />
      </p>
    </div>
  )

  if (widget.type === "kpi-net") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Net Position</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Wallet className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        <AnimatedNumber value={kpi.netPosition} prefix={symbol} />
      </p>
      <p className="text-xs text-muted-foreground">
        {kpi.savingsRate.toFixed(1)}% savings rate
      </p>
    </div>
  )

  if (widget.type === "kpi-docs") return (
    <div className="flex h-full flex-col justify-between">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Documents</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <FileText className="h-4 w-4 text-primary" />
        </div>
      </div>
      <p className="text-2xl font-semibold text-foreground">
        <AnimatedNumber value={kpi.documentCount} />
      </p>
    </div>
  )

  if (widget.type === "area-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-4 text-xs text-muted-foreground">Monthly income vs expenses from your documents</p>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip symbol={symbol} />} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#incomeGrad)" dot={{ fill: "hsl(var(--primary))", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
            <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expenseGrad)" dot={{ fill: "#ef4444", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "bar-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-4 text-xs text-muted-foreground">Total spend per category</p>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={28}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip symbol={symbol} />} />
            <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]}>
              {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "pie-chart") return (
    <div className="flex h-full flex-col">
      <p className="mb-2 text-xs text-muted-foreground">Breakdown by document type</p>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={docTypeData} cx="50%" cy="50%" innerRadius="40%" outerRadius="65%" paddingAngle={3} dataKey="value">
              {docTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
            </Pie>
            <Tooltip formatter={(v: any, n: any) => [v, n]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )

  if (widget.type === "text-summary") return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Lock className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">AI Text Summary</p>
        <p className="mt-1 text-xs text-muted-foreground">Available on Pro plan</p>
      </div>
      <Button size="sm" variant="outline" className="rounded-lg text-xs" disabled>
        Upgrade to unlock
      </Button>
    </div>
  )

  if (widget.type === "advanced-analytics") return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">Advanced Analytics</p>
        <p className="mt-1 text-xs text-muted-foreground">AI-powered insights on Pro plan</p>
      </div>
      <Button size="sm" variant="outline" className="rounded-lg text-xs" disabled>
        Upgrade to unlock
      </Button>
    </div>
  )

  return null
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
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedConfirm, setSavedConfirm] = useState(false)
  const [showWidgetPanel, setShowWidgetPanel] = useState(false)
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null)

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setSessionLoaded(true) })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load layout ────────────────────────────────────────────────────────────
  const loadLayout = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("dashboard_layouts")
      .select("layout")
      .eq("user_id", session.user.id)
      .single()
    if (data?.layout?.length) setWidgets(data.layout)
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
    const savingsRate = totalIncome > 0 ? (netPosition / totalIncome) * 100 : 0

    setKpi({ totalIncome, totalExpenses, netPosition, documentCount: userFiles.length, savingsRate, currency })

    // Monthly
    const monthMap: Record<string, { expenses: number; income: number }> = {}
    fields.forEach((f: any) => {
      if (!f.document_date) return
      const month = f.document_date.slice(0, 7)
      if (!monthMap[month]) monthMap[month] = { expenses: 0, income: 0 }
      if (["payslip", "income_statement"].includes(f.files.document_type))
        monthMap[month].income += parseFloat(f.gross_income ?? f.total_amount ?? 0)
      else monthMap[month].expenses += parseFloat(f.total_amount ?? 0)
    })
    setMonthlyData(Object.entries(monthMap).sort(([a], [b]) => a.localeCompare(b)).map(([m, d]) => ({
      month: new Date(m + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }), ...d
    })))

    // Category
    const catMap: Record<string, number> = {}
    expenseFields.forEach((f: any) => {
      const cat = f.expense_category ?? "Other"
      catMap[cat] = (catMap[cat] ?? 0) + parseFloat(f.total_amount ?? 0)
    })
    setCategoryData(Object.entries(catMap).sort(([,a],[,b]) => b - a).map(([name, value]) => ({ name, value })))

    // Doc types
    const typeMap: Record<string, number> = {}
    userFiles.forEach((f) => { typeMap[f.document_type] = (typeMap[f.document_type] ?? 0) + 1 })
    setDocTypeData(Object.entries(typeMap).map(([name, value]) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), value })))

    setLoading(false)
  }, [session, dateFrom, dateTo])

  useEffect(() => { loadLayout(); }, [loadLayout])
  useEffect(() => { loadData(); }, [loadData])

  // ── Save layout ────────────────────────────────────────────────────────────
  const saveLayout = async () => {
    if (!session?.user?.id) return
    setIsSaving(true)
    await supabase.from("dashboard_layouts").upsert({
      user_id: session.user.id,
      layout: widgets,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" })
    setIsSaving(false)
    setIsDirty(false)
    setSavedConfirm(true)
    setTimeout(() => setSavedConfirm(false), 2000)
  }

  const addWidget = (type: string, title: string, isPremium: boolean) => {
    if (isPremium) return
    const existing = widgets.find(w => w.type === type)
    if (existing) return
    const isKpi = type.startsWith("kpi")
    const newWidget: Widget = { id: `${type}-${Date.now()}`, type, title, w: isKpi ? 1 : 2, h: isKpi ? 1 : 2 }
    setWidgets(prev => [...prev, newWidget])
    setIsDirty(true)
  }

  const removeWidget = (id: string) => {
    setWidgets(prev => prev.filter(w => w.id !== id))
    setIsDirty(true)
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  const symbol = kpi.currency === "PHP" ? "₱" : "$"

  // Group widgets for grid rendering
  const kpiWidgets = widgets.filter(w => w.type.startsWith("kpi"))
  const chartWidgets = widgets.filter(w => !w.type.startsWith("kpi"))

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <div className="flex flex-1 overflow-hidden">

        {/* MAIN AREA */}
        <div className="flex flex-1 flex-col overflow-hidden">

          {/* TOP TOOLBAR */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-card px-4">
            <div className="flex items-center gap-2">

              {/* Date filter */}
              <div className="relative">
                <button
                  onClick={() => setShowDateFilter(!showDateFilter)}
                  className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Calendar className="h-3.5 w-3.5" />
                  {dateFrom && dateTo ? `${dateFrom} – ${dateTo}` : "All time"}
                  <ChevronDown className={`h-3 w-3 transition-transform ${showDateFilter ? "rotate-180" : ""}`} />
                </button>
                {showDateFilter && (
                  <div className="absolute left-0 top-9 z-20 rounded-xl border border-border bg-card p-4 shadow-xl">
                    <div className="space-y-2">
                      {[
                        { label: "All time", from: "", to: "" },
                        { label: "This year", from: `${new Date().getFullYear()}-01-01`, to: new Date().toISOString().slice(0,10) },
                        { label: "Last 90 days", from: new Date(Date.now()-90*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
                        { label: "Last 30 days", from: new Date(Date.now()-30*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
                      ].map(p => (
                        <button
                          key={p.label}
                          onClick={() => { setDateFrom(p.from); setDateTo(p.to); setShowDateFilter(false) }}
                          className={`block w-full rounded-lg px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted ${
                            dateFrom === p.from && dateTo === p.to ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <div className="h-px bg-border" />
                      <div className="flex items-center gap-2">
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                          className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                          className="w-32 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Advanced Analytics button — premium */}
              <button
                className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-colors hover:bg-muted"
                disabled
              >
                <Sparkles className="h-3.5 w-3.5" />
                Advanced Analytics
                <Lock className="h-3 w-3 ml-0.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Unsaved indicator */}
              {isDirty && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}

              {/* Save button */}
              <button
                onClick={saveLayout}
                disabled={!isDirty || isSaving}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs transition-colors ${
                  isDirty
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-border text-muted-foreground"
                }`}
              >
                {savedConfirm ? (
                  <><Check className="h-3.5 w-3.5" /> Saved</>
                ) : isSaving ? (
                  <><div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" /> Saving…</>
                ) : (
                  <><Save className="h-3.5 w-3.5" /> Save Layout</>
                )}
              </button>

              {/* Widget panel toggle */}
              <button
                onClick={() => setShowWidgetPanel(!showWidgetPanel)}
                className={`flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs transition-colors hover:bg-muted ${
                  showWidgetPanel ? "bg-muted text-foreground" : "text-muted-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Widgets
              </button>
            </div>
          </div>

          {/* CANVAS */}
          <div className="flex-1 overflow-y-auto bg-muted/20 p-6">
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-sm text-muted-foreground">Loading your data…</p>
                </div>
              </div>
            ) : (
              <AnimatePresence>
                <div className="space-y-4">

                  {/* KPI row */}
                  {kpiWidgets.length > 0 && (
                    <div className={`grid gap-4 grid-cols-${Math.min(kpiWidgets.length, 4)}`}
                      style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 4)}, minmax(0, 1fr))` }}
                    >
                      {kpiWidgets.map((widget, i) => (
                        <motion.div
                          key={widget.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.35, delay: i * 0.08 }}
                          className="group relative rounded-2xl border border-border bg-card p-5 shadow-sm"
                        >
                          <button
                            onClick={() => removeWidget(widget.id)}
                            className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <WidgetContent widget={widget} kpi={kpi} monthlyData={monthlyData} categoryData={categoryData} docTypeData={docTypeData} />
                        </motion.div>
                      ))}
                    </div>
                  )}

                  {/* Chart widgets */}
                  <div className="grid grid-cols-4 gap-4" style={{ gridAutoRows: "280px" }}>
                    {chartWidgets.map((widget, i) => (
                      <motion.div
                        key={widget.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                        className="group relative rounded-2xl border border-border bg-card p-5 shadow-sm"
                        style={{ gridColumn: `span ${widget.w}` }}
                        draggable
                        onDragStart={() => setDraggedWidget(widget.id)}
                        onDragEnd={() => setDraggedWidget(null)}
                      >
                        {/* Drag handle */}
                        <div className="absolute left-3 top-3 hidden cursor-grab opacity-0 group-hover:flex group-hover:opacity-100">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => removeWidget(widget.id)}
                          className="absolute right-2 top-2 hidden h-5 w-5 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>

                        <h3 className="mb-1 text-sm font-semibold text-foreground">{widget.title}</h3>
                        <div className="h-[calc(100%-32px)]">
                          <WidgetContent widget={widget} kpi={kpi} monthlyData={monthlyData} categoryData={categoryData} docTypeData={docTypeData} />
                        </div>
                      </motion.div>
                    ))}
                  </div>

                </div>
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* RIGHT PANEL — Widget Library */}
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
                <div className="space-y-1">
                  {WIDGET_LIBRARY.filter(w => !w.isPremium).map((item) => {
                    const alreadyAdded = widgets.some(w => w.type === item.type)
                    return (
                      <button
                        key={item.type}
                        onClick={() => addWidget(item.type, item.title, item.isPremium)}
                        disabled={alreadyAdded}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          alreadyAdded
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <span>{item.title}</span>
                        {alreadyAdded
                          ? <Check className="h-3.5 w-3.5 text-primary" />
                          : <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                        }
                      </button>
                    )
                  })}
                </div>

                <div className="my-3 h-px bg-border" />

                <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Premium</p>
                <div className="space-y-1">
                  {WIDGET_LIBRARY.filter(w => w.isPremium).map((item) => (
                    <div
                      key={item.type}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-muted-foreground/50"
                    >
                      <span>{item.title}</span>
                      <Lock className="h-3.5 w-3.5" />
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Upgrade to Pro to unlock AI-powered widgets and advanced analytics.
                  </p>
                  <Button size="sm" className="mt-2 w-full rounded-lg text-xs" disabled>
                    Upgrade to Pro
                  </Button>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </div>

      <Footer />
    </div>
  )
}
