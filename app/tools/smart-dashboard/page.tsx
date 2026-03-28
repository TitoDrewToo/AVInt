"use client"

import { useState, useEffect, useCallback } from "react"
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
import { TrendingUp, TrendingDown, FileText, DollarSign, Receipt, Wallet } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface DocumentField {
  file_id: string
  vendor_name: string | null
  employer_name: string | null
  document_date: string | null
  total_amount: number | null
  gross_income: number | null
  net_income: number | null
  expense_category: string | null
  currency: string | null
  files: { document_type: string; filename: string }
}

interface KPIData {
  totalIncome: number
  totalExpenses: number
  netPosition: number
  documentCount: number
  currency: string
}

interface MonthlyData {
  month: string
  expenses: number
  income: number
}

interface CategoryData {
  name: string
  value: number
}

// ── Animated counter ──────────────────────────────────────────────────────────

function AnimatedNumber({ value, prefix = "" }: { value: number; prefix?: string }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const duration = 1000
    const steps = 60
    const increment = value / steps
    let current = 0
    let step = 0

    const timer = setInterval(() => {
      step++
      current += increment
      if (step >= steps) {
        setDisplay(value)
        clearInterval(timer)
      } else {
        setDisplay(Math.floor(current))
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value])

  return (
    <span>
      {prefix}{display.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
    </span>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({
  title,
  value,
  currency,
  icon: Icon,
  trend,
  delay = 0,
}: {
  title: string
  value: number
  currency: string
  icon: any
  trend?: "up" | "down" | "neutral"
  delay?: number
}) {
  const currencySymbol = currency === "PHP" ? "₱" : "$"

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className="rounded-2xl border border-border bg-card p-6 shadow-sm"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            <AnimatedNumber value={value} prefix={currencySymbol} />
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          trend === "up" ? "bg-emerald-500/10 text-emerald-500" :
          trend === "down" ? "bg-red-500/10 text-red-500" :
          "bg-primary/10 text-primary"
        }`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {trend && trend !== "neutral" && (
        <div className={`mt-4 flex items-center gap-1 text-xs font-medium ${
          trend === "up" ? "text-emerald-500" : "text-red-500"
        }`}>
          {trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>{trend === "up" ? "Income" : "Expenses"} this period</span>
        </div>
      )}
    </motion.div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, currency }: any) {
  if (!active || !payload?.length) return null
  const symbol = currency === "PHP" ? "₱" : "$"
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartDashboardPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<KPIData>({ totalIncome: 0, totalExpenses: 0, netPosition: 0, documentCount: 0, currency: "PHP" })
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [docTypeData, setDocTypeData] = useState<CategoryData[]>([])

  const COLORS = ["hsl(var(--primary))", "hsl(var(--primary) / 0.7)", "hsl(var(--primary) / 0.5)", "hsl(var(--primary) / 0.35)", "hsl(var(--primary) / 0.2)"]

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setSessionLoaded(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadDashboardData = useCallback(async () => {
    if (!session?.user?.id) return
    setLoading(true)

    const { data: userFiles } = await supabase
      .from("files")
      .select("id, document_type")
      .eq("user_id", session.user.id)

    if (!userFiles?.length) { setLoading(false); return }

    const fileIds = userFiles.map((f) => f.id)

    const { data: fields } = await supabase
      .from("document_fields")
      .select("file_id, vendor_name, employer_name, document_date, total_amount, gross_income, net_income, expense_category, currency, files!inner(document_type, filename)")
      .in("file_id", fileIds)
      .order("document_date", { ascending: true })

    if (!fields?.length) { setLoading(false); return }

    const currency = fields[0]?.currency ?? "PHP"

    // ── KPIs ──────────────────────────────────────────────────────────────
    const incomeFields = fields.filter((f: any) =>
      f.files.document_type === "payslip" || f.files.document_type === "income_statement"
    )
    const expenseFields = fields.filter((f: any) =>
      f.files.document_type === "receipt" || f.files.document_type === "invoice"
    )

    const totalIncome = incomeFields.reduce((sum: number, f: any) =>
      sum + parseFloat(f.gross_income ?? f.total_amount ?? 0), 0)
    const totalExpenses = expenseFields.reduce((sum: number, f: any) =>
      sum + parseFloat(f.total_amount ?? 0), 0)

    setKpi({
      totalIncome,
      totalExpenses,
      netPosition: totalIncome - totalExpenses,
      documentCount: userFiles.length,
      currency,
    })

    // ── Monthly data ──────────────────────────────────────────────────────
    const monthMap: Record<string, { expenses: number; income: number }> = {}
    fields.forEach((f: any) => {
      if (!f.document_date) return
      const month = f.document_date.slice(0, 7) // YYYY-MM
      if (!monthMap[month]) monthMap[month] = { expenses: 0, income: 0 }
      const isIncome = f.files.document_type === "payslip" || f.files.document_type === "income_statement"
      if (isIncome) {
        monthMap[month].income += parseFloat(f.gross_income ?? f.total_amount ?? 0)
      } else {
        monthMap[month].expenses += parseFloat(f.total_amount ?? 0)
      }
    })

    const monthlyArr = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: new Date(month + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        ...data,
      }))
    setMonthlyData(monthlyArr)

    // ── Category data ─────────────────────────────────────────────────────
    const catMap: Record<string, number> = {}
    expenseFields.forEach((f: any) => {
      const cat = f.expense_category ?? "Uncategorized"
      catMap[cat] = (catMap[cat] ?? 0) + parseFloat(f.total_amount ?? 0)
    })
    setCategoryData(
      Object.entries(catMap)
        .sort(([, a], [, b]) => b - a)
        .map(([name, value]) => ({ name, value }))
    )

    // ── Document type distribution ────────────────────────────────────────
    const typeMap: Record<string, number> = {}
    userFiles.forEach((f) => {
      typeMap[f.document_type] = (typeMap[f.document_type] ?? 0) + 1
    })
    setDocTypeData(
      Object.entries(typeMap).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
      }))
    )

    setLoading(false)
  }, [session])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  const symbol = kpi.currency === "PHP" ? "₱" : "$"

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1 bg-muted/20 px-6 py-8">
        <div className="mx-auto max-w-7xl">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <h1 className="text-2xl font-semibold text-foreground">Smart Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Financial overview from your uploaded documents
            </p>
          </motion.div>

          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">Loading your data…</p>
              </div>
            </div>
          ) : (
            <AnimatePresence>
              <div className="space-y-6">

                {/* KPI Cards */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <KPICard title="Total Income" value={kpi.totalIncome} currency={kpi.currency} icon={TrendingUp} trend="up" delay={0} />
                  <KPICard title="Total Expenses" value={kpi.totalExpenses} currency={kpi.currency} icon={Receipt} trend="down" delay={0.1} />
                  <KPICard title="Net Position" value={kpi.netPosition} currency={kpi.currency} icon={Wallet} trend="neutral" delay={0.2} />
                  <KPICard title="Documents" value={kpi.documentCount} currency={kpi.currency} icon={FileText} trend="neutral" delay={0.3} />
                </div>

                {/* Charts row 1 — Area chart full width */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.4 }}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <h2 className="mb-1 text-sm font-semibold text-foreground">Income vs Expenses Over Time</h2>
                  <p className="mb-6 text-xs text-muted-foreground">Monthly breakdown from your documents</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
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
                      <Tooltip content={<CustomTooltip currency={kpi.currency} />} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="income" name="Income" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#incomeGrad)" dot={{ fill: "hsl(var(--primary))", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                      <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" strokeWidth={2} fill="url(#expenseGrad)" dot={{ fill: "#ef4444", r: 4, strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </motion.div>

                {/* Charts row 2 — Bar + Pie side by side */}
                <div className="grid gap-4 lg:grid-cols-2">

                  {/* Bar chart — expenses by category */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 }}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <h2 className="mb-1 text-sm font-semibold text-foreground">Expenses by Category</h2>
                    <p className="mb-6 text-xs text-muted-foreground">Total spend per category</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={categoryData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }} barSize={32}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${symbol}${(v/1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip currency={kpi.currency} />} />
                        <Bar dataKey="value" name="Amount" radius={[6, 6, 0, 0]}>
                          {categoryData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>

                  {/* Pie chart — document type distribution */}
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.6 }}
                    className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                  >
                    <h2 className="mb-1 text-sm font-semibold text-foreground">Document Distribution</h2>
                    <p className="mb-6 text-xs text-muted-foreground">Breakdown by document type</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <PieChart>
                        <Pie
                          data={docTypeData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {docTypeData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any, name: any) => [value, name]} />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: 12 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </motion.div>
                </div>

                {/* Summary row */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 }}
                  className="rounded-2xl border border-border bg-card p-6 shadow-sm"
                >
                  <h2 className="mb-4 text-sm font-semibold text-foreground">Financial Summary</h2>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                      { label: "Gross Income", value: symbol + kpi.totalIncome.toLocaleString() },
                      { label: "Total Expenses", value: symbol + kpi.totalExpenses.toLocaleString() },
                      { label: "Net Position", value: symbol + kpi.netPosition.toLocaleString() },
                      { label: "Savings Rate", value: kpi.totalIncome > 0 ? ((kpi.netPosition / kpi.totalIncome) * 100).toFixed(1) + "%" : "—" },
                    ].map((item, i) => (
                      <div key={i} className="rounded-xl bg-muted/40 p-4">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </motion.div>

              </div>
            </AnimatePresence>
          )}
        </div>
      </main>

      <Footer />
    </div>
  )
}
