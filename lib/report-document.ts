import type { Entitlement } from "@/lib/entitlement"
import type { ReportFilters } from "@/lib/report-engine"
import type { TaxBundleSummary, TaxRow } from "@/lib/tax-bundle"
import type { ReportSectionResult } from "@/lib/report-sections"

export type ReportBlock =
  | { type: "kpi"; items: { label: string; value: string; note?: string }[] }
  | { type: "share"; title: string; caption?: string; rows: { label: string; value: number }[] }
  | { type: "table"; title: string; columns: string[]; rows: (string | number | null)[][] }
  | { type: "stat"; title: string; value: string; caption?: string }
  | { type: "narrative"; title: string; text: string }
  | { type: "note"; text: string }

export type ReportDocument = {
  title: string
  subtitle?: string
  period: { from: string; to: string }
  generatedAt: string
  coverage?: { statement: string; complete: boolean }
  blocks: (ReportBlock & { suppressed?: boolean; reason?: string })[]
  method?: string
}

type EngineReportResult =
  | { rows: TaxRow[]; summary: TaxBundleSummary; totalOwnedDocs: number; detectedYears: number[]; defaultYear: number | null }
  | { expenses: TaxRow[] }
type ReportResult = EngineReportResult | ReportSectionResult
export type ReportKey = "tax-bundle" | "business-expense" | "profit-loss" | "income-summary" | "expense-summary" | "contract-summary" | "key-terms"

function formatAmount(value: number, currency: string | null): string {
  if (!currency) return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function dateBounds(rows: TaxRow[]): { from: string; to: string } {
  const dates = rows.map((row) => row.document_date).filter((date): date is string => Boolean(date)).sort()
  return { from: dates[0] ?? "All dates", to: dates.at(-1) ?? "All dates" }
}

function periodFor(filters: ReportFilters, rows: TaxRow[]) {
  const fallback = dateBounds(rows)
  return { from: filters.dateFrom || fallback.from, to: filters.dateTo || fallback.to }
}

function suppressed(reason: string) {
  return { suppressed: true, reason }
}

function sectionDocument(title: string, result: ReportSectionResult, report: Exclude<ReportKey, "tax-bundle" | "business-expense">, filters: ReportFilters, generatedAt: string): ReportDocument {
  const isProfitLoss = report === "profit-loss"
  const rows = "expenses" in result ? result.expenses : "income" in result ? result.income : "incomeRows" in result ? [...result.incomeRows, ...result.expenseRows] : "contracts" in result ? result.contracts : result.docs
  const objects = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
  const dates = objects.map((row) => row.document_date).filter((date): date is string => typeof date === "string").sort()
  const period = { from: filters.dateFrom || dates[0] || "All dates", to: filters.dateTo || dates.at(-1) || "All dates" }
  const reason = `No ${title.toLowerCase()} rows were returned for this reporting period; this block is not stated as zero.`
  const byCurrency = new Map<string, { income: number; expenses: number; total: number }>()
  for (const row of objects) {
    const currency = typeof row.currency === "string" && row.currency.trim() ? row.currency.trim().toUpperCase() : "UNSPECIFIED"
    const bucket = byCurrency.get(currency) ?? { income: 0, expenses: 0, total: 0 }
    const value = Number(row.total_amount ?? row.gross_income)
    const amount = Number.isFinite(value) ? value : 0
    if (isProfitLoss) {
      if ("gross_income" in row) bucket.income += amount
      else bucket.expenses += amount
    } else bucket.total += amount
    byCurrency.set(currency, bucket)
  }
  const currencyLabels = Array.from(byCurrency.keys()).map((currency) => currency === "UNSPECIFIED" ? "Unspecified currency" : currency)
  const hasMixedCurrency = byCurrency.size > 1
  const hasUnspecifiedCurrency = byCurrency.has("UNSPECIFIED")
  const columns = isProfitLoss ? ["Date", "Type", "Amount", "Currency"] : report === "contract-summary" || report === "key-terms" ? ["Date", "Counterparty", "Amount", "Currency"] : ["Date", report === "income-summary" ? "Employer" : "Vendor", "Amount", "Currency"]
  const tableRows = report === "profit-loss"
    ? objects.map((row) => [String(row.document_date ?? ""), "gross_income" in row ? "Income" : "Expense", (row.gross_income ?? row.total_amount ?? null) as string | number | null, (row.currency ?? null) as string | null])
    : objects.map((row) => [String(row.document_date ?? ""), (row.employer_name ?? row.vendor_name ?? row.counterparty_name ?? null) as string | null, (row.total_amount ?? null) as string | number | null, (row.currency ?? null) as string | null])
  const titleMap: Record<typeof report, string> = { "profit-loss": "Profit & Loss", "income-summary": "Income Summary", "expense-summary": "Expense Summary", "contract-summary": "Contract Summary", "key-terms": "Key Terms" }
  const kpiItems = isProfitLoss
    ? Array.from(byCurrency.entries()).flatMap(([currency, values]) => [
        { label: `Income · ${currency === "UNSPECIFIED" ? "Unspecified currency" : currency}`, value: formatAmount(values.income, currency === "UNSPECIFIED" ? null : currency) },
        { label: `Expenses · ${currency === "UNSPECIFIED" ? "Unspecified currency" : currency}`, value: formatAmount(values.expenses, currency === "UNSPECIFIED" ? null : currency) },
        { label: `Net · ${currency === "UNSPECIFIED" ? "Unspecified currency" : currency}`, value: formatAmount(values.income - values.expenses, currency === "UNSPECIFIED" ? null : currency) },
      ])
    : Array.from(byCurrency.entries()).map(([currency, values]) => ({ label: `Total · ${currency === "UNSPECIFIED" ? "Unspecified currency" : currency}`, value: formatAmount(values.total, currency === "UNSPECIFIED" ? null : currency) }))
  const notes = [
    hasMixedCurrency ? `Mixed currencies detected (${currencyLabels.join(", ")}). Values are shown separately by bucket; no combined total is stated.` : null,
    hasUnspecifiedCurrency ? "Rows with no currency are reported separately as Unspecified currency and are not combined with any currency total." : null,
  ].filter((text): text is string => Boolean(text))
  const method = `Method: this document maps the existing ${report} JSON result. Currency groups are kept separate${isProfitLoss ? ", and profit, expense, and net values are calculated independently per currency" : ""}; no cross-currency total is calculated.`
  return { title: titleMap[report], subtitle: `${period.from} to ${period.to}`, period, generatedAt, coverage: { statement: objects.length > 0 ? `Figures cover the rows returned for ${period.from} through ${period.to}.` : `No rows were returned for ${period.from} through ${period.to}.`, complete: objects.length > 0 }, blocks: [
    objects.length > 0 ? { type: "kpi", items: kpiItems } : { type: "kpi", items: [], ...suppressed(reason) },
    ...notes.map((text) => ({ type: "note" as const, text })),
    objects.length > 0 ? { type: "table", title: `${titleMap[report]} detail`, columns, rows: tableRows } : { type: "table", title: `${titleMap[report]} detail`, columns, rows: [], ...suppressed(reason) },
    { type: "note", text: method },
  ], method: `Source: Smart Storage ${report} report engine; currency-safe document mapping.` }
}

function taxDocument(result: Extract<ReportResult, { rows: TaxRow[] }>, filters: ReportFilters, generatedAt: string): ReportDocument {
  const { rows, summary } = result
  const period = periodFor(filters, rows)
  const hasRows = rows.length > 0
  const noRowsReason = "No records were returned for this reporting period; this block is not stated as zero."
  const currency = summary.primaryCurrency || "USD"
  const categoryRows = summary.scheduleC.map((item) => ({ label: `${item.line} · ${item.label}`, value: item.amount }))

  return {
    title: "Tax Bundle — Schedule C",
    subtitle: `${period.from} to ${period.to}`,
    period,
    generatedAt,
    coverage: {
      statement: hasRows
        ? `Figures cover the records returned for ${period.from} through ${period.to}.`
        : `No records were returned for ${period.from} through ${period.to}.`,
      complete: hasRows,
    },
    blocks: [
      hasRows
        ? { type: "kpi", items: [
            { label: "Documents", value: String(result.totalOwnedDocs), note: "records in this period" },
            { label: "Gross income", value: formatAmount(summary.totalGross, currency), note: "bookkeeping total" },
            { label: "Proposed deductible", value: formatAmount(summary.deductibleExpenses, currency), note: "Schedule C mapped" },
          ] }
        : { type: "kpi", items: [], ...suppressed(noRowsReason) },
      categoryRows.length > 0
        ? { type: "share", title: "Proposed deductible by Schedule C line", caption: "Amounts use the report's existing deductible conventions.", rows: categoryRows }
        : { type: "share", title: "Proposed deductible by Schedule C line", rows: [], ...suppressed("No Schedule C-mapped expense rows are covered by this period.") },
      hasRows
        ? { type: "stat", title: "Estimated net Schedule C", value: formatAmount(summary.estimatedNetScheduleC, currency), caption: "Self-employment gross less proposed deductible expenses; not a filed tax result." }
        : { type: "stat", title: "Estimated net Schedule C", value: "", ...suppressed(noRowsReason) },
      summary.scheduleC.length > 0
        ? { type: "table", title: "Schedule C detail", columns: ["Line", "Category", "Raw", "Proposed", "Review"], rows: summary.scheduleC.map((item) => [item.line, item.label, formatAmount(item.grossAmount, currency), formatAmount(item.amount, currency), String(item.reviewCount)]) }
        : { type: "table", title: "Schedule C detail", columns: ["Line", "Category", "Raw", "Proposed", "Review"], rows: [], ...suppressed("No categorized expense detail is covered by this period.") },
      { type: "note", text: "Method: this document uses the existing tax-bundle result, including its currency filtering, income classification, Schedule C mapping, meal convention, and review flags. It is informational and not a certified tax filing." },
    ],
    method: "Source: Smart Storage tax-bundle report engine. No new data source or calculation is used for PDF output.",
  }
}

function businessDocument(result: Extract<ReportResult, { expenses: TaxRow[] }>, filters: ReportFilters, generatedAt: string): ReportDocument {
  const { expenses } = result
  const period = periodFor(filters, expenses)
  const hasRows = expenses.length > 0
  return {
    title: "Business Expense Report",
    subtitle: `${period.from} to ${period.to}`,
    period,
    generatedAt,
    coverage: {
      statement: hasRows
        ? `Figures cover the expense records returned for ${period.from} through ${period.to}.`
        : `No expense records were returned for ${period.from} through ${period.to}.`,
      complete: hasRows,
    },
    blocks: [
      hasRows
        ? { type: "kpi", items: [{ label: "Expenses", value: String(expenses.length), note: "USD records in this period" }] }
        : { type: "kpi", items: [], ...suppressed("No expense records were returned for this reporting period; this block is not stated as zero.") },
      hasRows
        ? { type: "table", title: "Expense detail", columns: ["Date", "Vendor", "Category", "Amount", "Source"], rows: expenses.map((row) => [row.document_date, row.vendor_name, row.expense_category, row.total_amount, row.filename]) }
        : { type: "table", title: "Expense detail", columns: ["Date", "Vendor", "Category", "Amount", "Source"], rows: [], ...suppressed("No expense detail is covered by this period.") },
      { type: "note", text: "Method: this document uses the existing business-expense report result and its existing USD filtering. No new data source or calculation is used for PDF output." },
    ],
    method: "Source: Smart Storage business-expense report engine.",
  }
}

export function toReportDocument(
  report: ReportKey,
  result: ReportResult,
  filters: ReportFilters = {},
  generatedAt = new Date().toISOString(),
): ReportDocument {
  if (report === "tax-bundle" && "rows" in result) return taxDocument(result as Extract<EngineReportResult, { rows: TaxRow[] }>, filters, generatedAt)
  if (report === "business-expense" && "expenses" in result) return businessDocument(result as Extract<EngineReportResult, { expenses: TaxRow[] }>, filters, generatedAt)
  if (report !== "tax-bundle" && report !== "business-expense") return sectionDocument(report.replaceAll("-", " "), result as ReportSectionResult, report, filters, generatedAt)
  throw new Error(`Report result does not match ${report}`)
}

export type ReportEngineAccess = {
  userId: string
  entitlement: Entitlement
}
