// Pure aggregation for the Tax Bundle report.
//
// Kept free of React, Supabase, and DOM imports so it can be unit-tested and
// so render code (page.tsx) cannot drift from CSV export logic. All math for
// the Tax Bundle flows through computeTaxBundle — if a number appears on the
// report or in a CSV, it came from here.

// ── Schedule C Line-Item Mapping ──────────────────────────────────────────────
// https://www.irs.gov/pub/irs-pdf/f1040sc.pdf

export interface ScheduleCLineDef {
  line: string
  label: string
  categories: string[]
}

// Sourced from IRS Schedule C (Form 1040) Part II, 2025 revision.
// https://www.irs.gov/pub/irs-pdf/f1040sc.pdf
//
// Notes:
// - Line 27b ("Other expenses") is the catch-all from Part V. Line 27a is the
//   narrow Energy-Efficient Commercial Buildings deduction and is NOT a
//   general "other" bucket — we do not route anything there.
// - Entertainment is intentionally absent. The Tax Cuts and Jobs Act (TCJA,
//   effective 2018+) eliminated the business entertainment deduction entirely.
//   Only meals remain (50%, Line 24b). Entertainment categories fall through
//   to "review" status so the user is warned rather than silently halved.
// - Equipment / Hardware map to Line 13 (Depreciation / §179) by default. The
//   de-minimis safe harbor ($2,500/item) and §179 full-expensing elections may
//   allow direct expensing — flagged as a note in the report, not auto-applied.
export const SCHEDULE_C_LINES: ScheduleCLineDef[] = [
  { line: "Line 8",  label: "Advertising",           categories: ["Marketing", "Advertising", "Design", "Printing"] },
  { line: "Line 9",  label: "Car & Truck Expenses",  categories: ["Fuel", "Parking", "Transport", "Tolls", "Vehicle Maintenance"] },
  { line: "Line 10", label: "Commissions & Fees",    categories: ["Commissions", "Sales Commissions"] },
  { line: "Line 11", label: "Contract Labor",        categories: ["Consulting", "Contract Labor", "Freelance"] },
  { line: "Line 13", label: "Depreciation (§179)",   categories: ["Equipment", "Hardware", "Computer"] },
  { line: "Line 15", label: "Insurance",             categories: ["Insurance"] },
  { line: "Line 16b",label: "Interest (Other)",      categories: ["Loan Interest", "Business Interest", "Credit Card Interest"] },
  { line: "Line 17", label: "Legal & Professional",  categories: ["Legal", "Accounting", "Professional Services"] },
  { line: "Line 18", label: "Office Expense",        categories: ["Office", "Office Supplies"] },
  { line: "Line 20a",label: "Rent (Vehicles/Equipment)", categories: ["Vehicle Rental", "Equipment Rental", "Machinery Rental"] },
  { line: "Line 20b",label: "Rent (Other Business Property)", categories: ["Rent", "Coworking", "Office Rent"] },
  { line: "Line 21", label: "Repairs & Maintenance", categories: ["Repairs", "Maintenance"] },
  { line: "Line 22", label: "Supplies",              categories: ["Subscriptions", "SaaS", "Cloud Services", "Software"] },
  { line: "Line 23", label: "Taxes & Licenses",      categories: ["Tax", "Taxes", "Business License", "Permit"] },
  { line: "Line 24a",label: "Travel",                categories: ["Travel", "Accommodation", "Airfare", "Lodging"] },
  { line: "Line 24b",label: "Meals (50% deductible)",categories: ["Meals", "Business Meals", "Client Meals"] },
  { line: "Line 25", label: "Utilities",             categories: ["Utilities", "Internet", "Phone", "Electricity"] },
  { line: "Line 26", label: "Wages",                 categories: ["Wages", "Employee Wages", "Payroll"] },
  { line: "Line 27b",label: "Other Expenses",        categories: ["Training", "Education", "Conferences", "Bank Fees", "Dues"] },
  { line: "Line 30", label: "Home Office",           categories: ["Home Office"] },
]

const CATEGORY_TO_LINE = new Map<string, string>()
for (const sc of SCHEDULE_C_LINES) {
  for (const cat of sc.categories) {
    CATEGORY_TO_LINE.set(cat.toLowerCase(), sc.line)
  }
}

export const ALL_SC_CATEGORIES = SCHEDULE_C_LINES.flatMap(l => l.categories).sort()

export function getScheduleCLine(category: string | null): string | null {
  if (!category) return null
  return CATEGORY_TO_LINE.get(category.toLowerCase()) ?? null
}

export function getScheduleCLabel(lineNum: string): string {
  return SCHEDULE_C_LINES.find(l => l.line === lineNum)?.label ?? "Other"
}

// ── Deductibility Confidence ──────────────────────────────────────────────────

export type DeductStatus = "deductible" | "review" | "uncategorized"

export function getDeductStatus(category: string | null, confidence: number | null): DeductStatus {
  if (!category || category === "Uncategorized" || category === "Other") return "uncategorized"
  const line = getScheduleCLine(category)
  if (!line) return "review"                                   // category exists but doesn't map to Schedule C
  if (confidence !== null && confidence < 0.7) return "review" // low AI confidence
  return "deductible"
}

// ── Row + Summary Types ──────────────────────────────────────────────────────

export interface TaxRow {
  file_id: string
  filename: string
  document_type: string
  vendor_name: string | null
  vendor_normalized?: string | null
  employer_name: string | null
  document_date: string | null
  period_start?: string | null
  period_end?: string | null
  total_amount: number | null
  gross_income: number | null
  net_income: number | null
  expense_category: string | null
  income_source?: IncomeSourceClass | null
  classification_rationale?: string | null
  jurisdiction?: string | null
  currency: string | null
  confidence_score: number | null
  storage_path: string | null
}

// Structured income classification from the normalizer. `null` means legacy
// row (pre-v2 normalization) — partitioning falls back to document_type.
export type IncomeSourceClass =
  | "business"
  | "wage"
  | "investment"
  | "rental"
  | "interest"
  | "other"

export interface ScheduleCTotal {
  line: string
  label: string
  amount: number        // deductible (meals halved)
  grossAmount: number   // raw pre-haircut
  items: TaxRow[]
  reviewCount: number
}

export type IncomeSourceType = "wage" | "self_employment"

export interface EmployerIncome {
  source: IncomeSourceType
  gross: number
  net: number
  payrollDeductions: number
  docs: number
}

export interface TaxBundleSummary {
  primaryCurrency: string
  currencies: string[]
  mixedCurrency: boolean

  // All income rows (union) — retained for audit-trail rendering.
  incomeRows: TaxRow[]
  expenseRows: TaxRow[]

  // Wage / W-2-like income. Informational — NOT used in the Schedule-C-style
  // net calculation. Sourced primarily from income_source === "wage", with
  // document_type === "payslip" as the legacy fallback when the row has no
  // income_source stamped yet.
  wageRows: TaxRow[]
  wageGross: number
  wageNet: number
  wagePayrollDeductions: number  // sum of (gross − net) on payslips

  // Self-employment / business income — the Schedule C base. Sourced from
  // income_source === "business", with document_type === "income_statement"
  // as the legacy fallback.
  selfEmploymentRows: TaxRow[]
  selfEmploymentGross: number

  // Non-Schedule-C income surfaced for display only (investment, rental,
  // interest, other). Never enters estimatedNetScheduleC.
  otherIncomeRows: TaxRow[]
  otherIncomeGross: number
  otherIncomeByType: Map<IncomeSourceClass, number>

  // Combined bookkeeping totals (display only, not used in Schedule C math).
  // Note: there is intentionally no combined "totalNet" — "net" has no
  // meaning for income_statement rows, so combining wageNet with
  // selfEmploymentGross produces a synthetic figure that misleads readers.
  totalGross: number              // wageGross + selfEmploymentGross
  totalPayrollDeductions: number  // alias for wagePayrollDeductions

  totalExpensesRaw: number        // every expense row, raw
  deductibleExpenses: number      // Σ scheduleC[*].amount — reconciles exactly
  estimatedNetScheduleC: number   // selfEmploymentGross − deductibleExpenses (NOT totalGross)
  mealsGross: number
  mealsDeductible: number
  scheduleC: ScheduleCTotal[]
  uncategorizedItems: TaxRow[]
  reviewItems: TaxRow[]
  incomeByEmployer: Map<string, EmployerIncome>
}

export const MEALS_DEDUCTIBLE_RATIO = 0.5

// ── Pure Aggregation ──────────────────────────────────────────────────────────

export function computeTaxBundle(rows: TaxRow[]): TaxBundleSummary {
  const currencySet = new Set<string>()
  for (const r of rows) currencySet.add((r.currency ?? "USD").toUpperCase())
  const currencies = Array.from(currencySet)
  const mixedCurrency = currencies.length > 1

  // Dominant currency by magnitude — for display only.
  const weight: Record<string, number> = {}
  for (const r of rows) {
    const c = (r.currency ?? "USD").toUpperCase()
    weight[c] = (weight[c] ?? 0) + Math.abs(r.total_amount ?? r.gross_income ?? 0)
  }
  const primaryCurrency = Object.entries(weight).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD"

  // Income classification — prefer the AI-assigned income_source (v2
  // normalization). Legacy rows (income_source === null) fall back to the
  // document_type heuristic so mixed vintages keep working during the
  // backfill window.
  const classify = (r: TaxRow): IncomeSourceClass | null => {
    if (r.income_source) return r.income_source
    if (r.document_type === "payslip") return "wage"
    if (r.document_type === "income_statement") return "business"
    return null
  }

  const wageRows: TaxRow[]           = []
  const selfEmploymentRows: TaxRow[] = []
  const otherIncomeRows: TaxRow[]    = []
  const expenseRows: TaxRow[]        = []

  for (const r of rows) {
    if (r.document_type === "receipt" || r.document_type === "invoice") {
      expenseRows.push(r)
      continue
    }
    const cls = classify(r)
    if (cls === "wage")              wageRows.push(r)
    else if (cls === "business")     selfEmploymentRows.push(r)
    else if (cls != null)            otherIncomeRows.push(r)
    // cls === null → unclassified non-expense row; omitted from income math.
  }

  const incomeRows = [...wageRows, ...selfEmploymentRows, ...otherIncomeRows]

  // Wage income (payslips). Informational only — does NOT enter Schedule C math.
  const wageGross = wageRows.reduce((s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0)
  const wageNet   = wageRows.reduce((s, r) => s + (r.net_income ?? 0), 0)
  const wagePayrollDeductions = wageRows.reduce((s, r) => {
    if (r.gross_income != null && r.net_income != null) return s + Math.max(0, r.gross_income - r.net_income)
    return s
  }, 0)

  // Self-employment / business income — the ONLY base used by
  // estimatedNetScheduleC below.
  const selfEmploymentGross = selfEmploymentRows.reduce(
    (s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0,
  )

  // Non-Schedule-C income surfaced separately. Never netted against expenses.
  const otherIncomeGross = otherIncomeRows.reduce(
    (s, r) => s + (r.gross_income ?? r.total_amount ?? 0), 0,
  )
  const otherIncomeByType = new Map<IncomeSourceClass, number>()
  for (const r of otherIncomeRows) {
    const cls = (r.income_source ?? "other") as IncomeSourceClass
    const amt = r.gross_income ?? r.total_amount ?? 0
    otherIncomeByType.set(cls, (otherIncomeByType.get(cls) ?? 0) + amt)
  }

  // Combined bookkeeping totals — for audit and Summary Strip display only.
  const totalGross = wageGross + selfEmploymentGross + otherIncomeGross
  const totalPayrollDeductions = wagePayrollDeductions

  const totalExpensesRaw = expenseRows.reduce((s, r) => s + (r.total_amount ?? 0), 0)

  // Income by source+name — a payslip and a business statement from the
  // same counterparty render as distinct rows. Keyed by the resolved
  // EmployerIncome.source so business / wage / other never collide.
  const incomeByEmployer = new Map<string, EmployerIncome>()
  const toEmployerSource = (cls: IncomeSourceClass | null): IncomeSourceType => {
    if (cls === "wage") return "wage"
    return "self_employment" // business + all other non-wage buckets
  }
  for (const r of incomeRows) {
    const cls = classify(r)
    const source = toEmployerSource(cls)
    const defaultName =
      source === "wage"            ? "Unknown Employer" :
      cls === "business"           ? "Unknown Business Source" :
      cls === "investment"         ? "Investment Income" :
      cls === "rental"             ? "Rental Income" :
      cls === "interest"           ? "Interest Income" :
                                     "Other Income"
    const name = r.employer_name ?? r.vendor_name ?? defaultName
    const key = `${source}|${cls ?? "unknown"}|${name}`
    const existing = incomeByEmployer.get(key) ?? { source, gross: 0, net: 0, payrollDeductions: 0, docs: 0 }
    const gross = r.gross_income ?? r.total_amount ?? 0
    const net   = r.net_income ?? 0
    incomeByEmployer.set(key, {
      source,
      gross: existing.gross + gross,
      net: existing.net + net,
      payrollDeductions: existing.payrollDeductions + (source === "wage" && r.gross_income != null && r.net_income != null ? Math.max(0, gross - net) : 0),
      docs: existing.docs + 1,
    })
  }

  const scheduleCMap = new Map<string, ScheduleCTotal>()
  const uncategorizedItems: TaxRow[] = []
  const reviewItems: TaxRow[] = []
  let mealsGross = 0
  let mealsDeductible = 0

  for (const r of expenseRows) {
    const status = getDeductStatus(r.expense_category, r.confidence_score)

    if (status === "uncategorized") {
      uncategorizedItems.push(r)
      continue
    }
    if (status === "review") reviewItems.push(r)

    const scLine = getScheduleCLine(r.expense_category) ?? "Line 27b"
    const raw = r.total_amount ?? 0
    const isMeals = scLine === "Line 24b"
    const deductible = isMeals ? raw * MEALS_DEDUCTIBLE_RATIO : raw
    if (isMeals) { mealsGross += raw; mealsDeductible += deductible }

    const existing = scheduleCMap.get(scLine) ?? {
      line: scLine,
      label: getScheduleCLabel(scLine),
      amount: 0,
      grossAmount: 0,
      items: [],
      reviewCount: 0,
    }
    existing.amount      += deductible
    existing.grossAmount += raw
    existing.items.push(r)
    if (status === "review") existing.reviewCount++
    scheduleCMap.set(scLine, existing)
  }

  const scheduleC = Array.from(scheduleCMap.values()).sort((a, b) => {
    const numA = parseFloat(a.line.replace(/[^\d.]/g, "")) || 99
    const numB = parseFloat(b.line.replace(/[^\d.]/g, "")) || 99
    return numA - numB
  })

  // deductibleExpenses is derived from buckets → reconciliation identity holds.
  const deductibleExpenses = scheduleC.reduce((s, sc) => s + sc.amount, 0)
  // Schedule-C-style net uses the self-employment base only. W-2 wages are
  // NOT eligible to be offset by Schedule C business expenses.
  const estimatedNetScheduleC = selfEmploymentGross - deductibleExpenses

  return {
    primaryCurrency,
    currencies,
    mixedCurrency,
    incomeRows,
    expenseRows,
    wageRows,
    wageGross,
    wageNet,
    wagePayrollDeductions,
    selfEmploymentRows,
    selfEmploymentGross,
    otherIncomeRows,
    otherIncomeGross,
    otherIncomeByType,
    totalGross,
    totalPayrollDeductions,
    totalExpensesRaw,
    deductibleExpenses,
    estimatedNetScheduleC,
    mealsGross,
    mealsDeductible,
    scheduleC,
    uncategorizedItems,
    reviewItems,
    incomeByEmployer,
  }
}

// ── CSV Export (pure, testable) ──────────────────────────────────────────────
// Consumed by app/tools/smart-storage/reports/tax-bundle/page.tsx. Pure so it
// can be unit-tested directly against fixtures without a DOM.

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`
}

export function generateTaxBundleCSV(summary: TaxBundleSummary): string {
  const {
    primaryCurrency: currency,
    currencies,
    mixedCurrency,
    scheduleC,
    uncategorizedItems,
    totalExpensesRaw,
    deductibleExpenses,
    mealsGross,
    mealsDeductible,
    selfEmploymentGross,
    estimatedNetScheduleC,
    wageGross,
    wagePayrollDeductions,
    selfEmploymentRows,
  } = summary

  const lines: string[] = []

  if (mixedCurrency) {
    lines.push(`"WARNING: Mixed currencies detected (${currencies.join(", ")}). Amounts are NOT aggregated — convert to a single currency before filing."`)
    lines.push("")
  }

  if (selfEmploymentRows.length > 0) {
    lines.push(`"ASSUMPTION: income_statement rows are treated as self-employment/business income (Schedule C base). Non-business income_statement documents (e.g. investment or interest statements) would make the Schedule-C-style net incorrect — verify with a preparer."`)
    lines.push("")
  }

  if (selfEmploymentGross === 0 && deductibleExpenses > 0) {
    lines.push(`"WARNING: Estimated Net (Schedule C) is negative because no business income was detected but deductible expenses exist. Schedule C expenses CANNOT be offset against W-2 wages — preparer review required."`)
    lines.push("")
  }

  lines.push(`"Currency",${currency}`)
  lines.push("")
  lines.push("Schedule C Line,IRS Category,Our Category,Vendor,Date,Raw Amount,Deductible Amount,Status,Source File")

  for (const sc of scheduleC) {
    const isMeals = sc.line === "Line 24b"
    for (const item of sc.items) {
      const status = getDeductStatus(item.expense_category, item.confidence_score)
      const raw = item.total_amount ?? 0
      const deductible = isMeals ? raw * MEALS_DEDUCTIBLE_RATIO : raw
      lines.push([
        sc.line,
        csvEscape(sc.label),
        csvEscape(item.expense_category ?? "Uncategorized"),
        csvEscape(item.vendor_name ?? ""),
        item.document_date ?? "",
        raw.toFixed(2),
        deductible.toFixed(2),
        status,
        csvEscape(item.filename),
      ].join(","))
    }
  }

  for (const item of uncategorizedItems) {
    const raw = item.total_amount ?? 0
    lines.push([
      "N/A",
      '"Uncategorized"',
      csvEscape(item.expense_category ?? "None"),
      csvEscape(item.vendor_name ?? ""),
      item.document_date ?? "",
      raw.toFixed(2),
      "0.00",
      "uncategorized",
      csvEscape(item.filename),
    ].join(","))
  }

  lines.push("")
  lines.push("SCHEDULE C SUMMARY")
  lines.push("Line,Category,Raw Total,Deductible Total")
  for (const sc of scheduleC) {
    lines.push(`${sc.line},${csvEscape(sc.label)},${sc.grossAmount.toFixed(2)},${sc.amount.toFixed(2)}`)
  }
  lines.push(`,"TOTAL (all documented expenses, raw)",${totalExpensesRaw.toFixed(2)},`)
  lines.push(`,"DEDUCTIBLE EXPENSES (Schedule C)",,${deductibleExpenses.toFixed(2)}`)
  if (mealsGross > 0) {
    lines.push(`,"  of which Meals (Line 24b) raw",${mealsGross.toFixed(2)},${mealsDeductible.toFixed(2)}`)
  }
  lines.push("")
  lines.push(`,"Business Income (income statements — Schedule C base)",${selfEmploymentGross.toFixed(2)},`)
  lines.push(`,"Estimated Net (Schedule C, before adjustments)",${estimatedNetScheduleC.toFixed(2)},`)
  if (wageGross > 0) {
    lines.push(`,"Wage Income (payslips — informational, NOT offset by Schedule C)",${wageGross.toFixed(2)},`)
  }
  if (wagePayrollDeductions > 0) {
    lines.push(`,"Payroll Deductions (Gross − Net, informational only)",${wagePayrollDeductions.toFixed(2)},`)
  }

  return lines.join("\n")
}
