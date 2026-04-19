// Standalone test for lib/tax-bundle.ts — run with:  npx tsx scripts/test-tax-bundle.ts
//
// Intentionally self-contained: no vitest/jest dependency. Exits non-zero on
// the first failing assertion. Uses inline fixtures covering the five scenarios
// called for in the Tax Bundle fix plan: clean baseline, meals-heavy,
// uncategorized-only, review-heavy, mixed-currency.

import { computeTaxBundle, generateEmployedTaxBundleCSV, generateTaxBundleCSV, type TaxRow } from "../lib/tax-bundle"

// ── Assertion helpers ────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; return }
  failed++
  failures.push(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
}

function approx(a: number, b: number, eps = 1e-9) {
  return Math.abs(a - b) < eps
}

// ── Row builders ─────────────────────────────────────────────────────────────

let _id = 0
function expense(p: { amount: number; category: string | null; currency?: string; confidence_score?: number }): TaxRow {
  _id++
  return {
    file_id: `f${_id}`,
    filename: `receipt-${_id}.pdf`,
    document_type: "receipt",
    vendor_name: `Vendor ${_id}`,
    employer_name: null,
    document_date: "2026-02-15",
    total_amount: p.amount,
    gross_income: null,
    net_income: null,
    expense_category: p.category,
    currency: p.currency ?? "USD",
    confidence_score: p.confidence_score ?? 0.95,
    storage_path: null,
  }
}

function payslip(partial: { gross: number; net?: number; currency?: string; employer?: string }): TaxRow {
  _id++
  return {
    file_id: `f${_id}`,
    filename: `payslip-${_id}.pdf`,
    document_type: "payslip",
    vendor_name: null,
    employer_name: partial.employer ?? "Acme Co",
    document_date: "2026-02-15",
    total_amount: null,
    gross_income: partial.gross,
    net_income: partial.net ?? null,
    expense_category: null,
    currency: partial.currency ?? "USD",
    confidence_score: 0.95,
    storage_path: null,
  }
}

function businessIncome(partial: { gross: number; currency?: string; source?: string }): TaxRow {
  _id++
  return {
    file_id: `f${_id}`,
    filename: `income-statement-${_id}.pdf`,
    document_type: "income_statement",
    vendor_name: null,
    employer_name: partial.source ?? "Client LLC",
    document_date: "2026-02-15",
    total_amount: null,
    gross_income: partial.gross,
    net_income: null,
    expense_category: null,
    currency: partial.currency ?? "USD",
    confidence_score: 0.95,
    storage_path: null,
  }
}

// ── Reconciliation identity (should hold for every fixture) ──────────────────

function reconcile(name: string, rows: TaxRow[]) {
  const s = computeTaxBundle(rows)
  const bucketSum = s.scheduleC.reduce((a, sc) => a + sc.amount, 0)
  assert(
    `${name}: deductibleExpenses === Σ scheduleC[*].amount`,
    approx(s.deductibleExpenses, bucketSum),
    `deductible=${s.deductibleExpenses} bucketSum=${bucketSum}`,
  )
  assert(
    `${name}: estimatedNetScheduleC === selfEmploymentGross − deductibleExpenses`,
    approx(s.estimatedNetScheduleC, s.selfEmploymentGross - s.deductibleExpenses),
  )
  return s
}

// ── Fixture 1: Clean baseline (self-employment only) ────────────────────────
// Business income + clean expenses, no meals/uncategorized/review, single
// currency. Uses income_statement so it feeds the Schedule C net.

{
  const rows: TaxRow[] = [
    businessIncome({ gross: 5000 }),
    expense({ amount: 300, category: "Office" }),          // Line 18
    expense({ amount: 200, category: "Subscriptions" }),   // Line 22
  ]
  const s = reconcile("clean-baseline", rows)

  assert("clean: selfEmploymentGross = 5000",        s.selfEmploymentGross === 5000)
  assert("clean: wageGross = 0",                     s.wageGross === 0)
  assert("clean: totalGross = 5000",                 s.totalGross === 5000)
  assert("clean: totalExpensesRaw = 500",            s.totalExpensesRaw === 500)
  assert("clean: deductibleExpenses = 500",          s.deductibleExpenses === 500)
  assert("clean: estimatedNetScheduleC = 4500",      s.estimatedNetScheduleC === 4500)
  assert("clean: no meals",                          s.mealsGross === 0 && s.mealsDeductible === 0)
  assert("clean: no uncategorized",                  s.uncategorizedItems.length === 0)
  assert("clean: no review items",                   s.reviewItems.length === 0)
  assert("clean: single currency",                   !s.mixedCurrency)
  assert("clean: scheduleC has 2 buckets",           s.scheduleC.length === 2)
}

// ── Fixture 2: Meals-heavy (self-employment) ────────────────────────────────
// Two meals rows $200 + $100 → raw 300, deductible 150. Plus office $50.
// Deductible total should be 200, not 350.

{
  const rows: TaxRow[] = [
    businessIncome({ gross: 10000 }),
    expense({ amount: 200, category: "Meals" }),
    expense({ amount: 100, category: "Business Meals" }),
    expense({ amount: 50,  category: "Office" }),
  ]
  const s = reconcile("meals-heavy", rows)

  assert("meals: selfEmploymentGross = 10000",       s.selfEmploymentGross === 10000)
  assert("meals: totalExpensesRaw = 350",            s.totalExpensesRaw === 350)
  assert("meals: mealsGross = 300",                  s.mealsGross === 300)
  assert("meals: mealsDeductible = 150",             s.mealsDeductible === 150)
  assert("meals: deductibleExpenses = 200 (150+50)", approx(s.deductibleExpenses, 200))
  assert("meals: estimatedNet = 9800",               approx(s.estimatedNetScheduleC, 9800))

  const line24b = s.scheduleC.find(x => x.line === "Line 24b")!
  assert("meals: Line 24b exists",                   !!line24b)
  assert("meals: Line 24b grossAmount = 300",        line24b.grossAmount === 300)
  assert("meals: Line 24b amount (deductible) = 150", line24b.amount === 150)
}

// ── Fixture 3: Uncategorized-only ────────────────────────────────────────────
// Uncategorized rows must NOT flow into deductibleExpenses but must still
// appear in totalExpensesRaw and in uncategorizedItems.

{
  const rows: TaxRow[] = [
    businessIncome({ gross: 2000 }),
    expense({ amount: 400, category: null }),
    expense({ amount: 150, category: "Uncategorized" }),
    expense({ amount: 75,  category: "Other" }),
  ]
  const s = reconcile("uncategorized-only", rows)

  assert("uncat: totalExpensesRaw = 625",            s.totalExpensesRaw === 625)
  assert("uncat: deductibleExpenses = 0",            s.deductibleExpenses === 0)
  assert("uncat: uncategorizedItems.length = 3",     s.uncategorizedItems.length === 3)
  assert("uncat: scheduleC empty",                   s.scheduleC.length === 0)
  assert("uncat: estimatedNet = selfEmploymentGross", s.estimatedNetScheduleC === s.selfEmploymentGross)
}

// ── Fixture 4: Review-heavy ──────────────────────────────────────────────────

{
  const rows: TaxRow[] = [
    businessIncome({ gross: 3000 }),
    // Low confidence → review, but still deductible at full amount
    expense({ amount: 120, category: "Office", confidence_score: 0.4 }),
    // Category not in any Schedule C bucket → "review", routed to Line 27b
    expense({ amount: 80, category: "MysteryCategory" }),
    // Clean deductible
    expense({ amount: 50, category: "Insurance" }),
  ]
  const s = reconcile("review-heavy", rows)

  assert("review: reviewItems.length = 2",           s.reviewItems.length === 2)
  assert("review: totalExpensesRaw = 250",           s.totalExpensesRaw === 250)
  assert("review: deductibleExpenses = 250 (policy: review included)",
    approx(s.deductibleExpenses, 250))
  const l18 = s.scheduleC.find(x => x.line === "Line 18")!
  assert("review: Line 18 has reviewCount 1",        l18?.reviewCount === 1)
  const l27b = s.scheduleC.find(x => x.line === "Line 27b")!
  assert("review: unmapped routed to Line 27b",      !!l27b && l27b.reviewCount === 1)
}

// ── Fixture 5: Mixed-currency ────────────────────────────────────────────────

{
  const rows: TaxRow[] = [
    businessIncome({ gross: 1000, currency: "USD" }),
    expense({ amount: 100, category: "Office", currency: "USD" }),
    expense({ amount: 50,  category: "Office", currency: "EUR" }),
    expense({ amount: 30,  category: "Office", currency: "GBP" }),
  ]
  const s = reconcile("mixed-currency", rows)

  assert("mixed: mixedCurrency = true",              s.mixedCurrency === true)
  assert("mixed: 3 currencies detected",             s.currencies.length === 3)
  assert("mixed: currencies contain USD/EUR/GBP",
    s.currencies.includes("USD") && s.currencies.includes("EUR") && s.currencies.includes("GBP"))
  assert("mixed: primaryCurrency = USD (by weight)", s.primaryCurrency === "USD")
}

// ── Fixture 6: Mixed-income (W-2 + self-employment together) ────────────────
// This is the core of the partitioning follow-up. Payslip wages must NOT
// be offset by Schedule C business expenses. estimatedNetScheduleC must be
// computed from selfEmploymentGross only.

{
  const rows: TaxRow[] = [
    payslip({ gross: 80000, net: 60000, employer: "BigCo" }),
    businessIncome({ gross: 20000, source: "Freelance Client" }),
    expense({ amount: 1000, category: "Office" }),
    expense({ amount: 400,  category: "Meals" }),  // 50% → 200 deductible
  ]
  const s = reconcile("mixed-income", rows)

  assert("mixed-income: wageGross = 80000",               s.wageGross === 80000)
  assert("mixed-income: wageNet = 60000",                 s.wageNet === 60000)
  assert("mixed-income: wagePayrollDeductions = 20000",   s.wagePayrollDeductions === 20000)
  assert("mixed-income: selfEmploymentGross = 20000",     s.selfEmploymentGross === 20000)
  assert("mixed-income: totalGross = 100000",             s.totalGross === 100000)
  assert("mixed-income: deductibleExpenses = 1200 (1000 + 200)",
    approx(s.deductibleExpenses, 1200))

  // THE CRUCIAL ASSERTION: estimatedNetScheduleC is computed from
  // selfEmploymentGross only, NOT from totalGross. If this fails, W-2 wages
  // are being offset by business expenses, which is the bug we are fixing.
  assert("mixed-income: estimatedNetScheduleC = selfEmploymentGross − deductible (18800)",
    approx(s.estimatedNetScheduleC, 18800),
    `got ${s.estimatedNetScheduleC}, expected 18800; if it's 98800 the bug is back`)
  assert("mixed-income: estimatedNetScheduleC !== totalGross − deductible (regression guard)",
    !approx(s.estimatedNetScheduleC, s.totalGross - s.deductibleExpenses))

  // incomeByEmployer should have one wage row and one business row keyed
  // distinctly by source.
  assert("mixed-income: incomeByEmployer has 2 entries", s.incomeByEmployer.size === 2)
  const entries = Array.from(s.incomeByEmployer.values())
  assert("mixed-income: one wage entry",  entries.filter(e => e.source === "wage").length === 1)
  assert("mixed-income: one SE entry",    entries.filter(e => e.source === "self_employment").length === 1)
}

// ── Fixture 7: Wage-only (payslip only, no business income) ─────────────────
// Schedule C net must be 0 − deductible expenses = negative deductible, and
// wages must NOT appear as the base.

{
  const rows: TaxRow[] = [
    payslip({ gross: 50000, net: 38000 }),
    expense({ amount: 500, category: "Office" }),  // user mis-categorized personal as biz
  ]
  const s = reconcile("wage-only", rows)

  assert("wage-only: wageGross = 50000",              s.wageGross === 50000)
  assert("wage-only: selfEmploymentGross = 0",        s.selfEmploymentGross === 0)
  assert("wage-only: deductibleExpenses = 500",       s.deductibleExpenses === 500)
  // Since there is no SE income, net is 0 − 500 = -500. This is a signal
  // to the user that they are trying to deduct against no business income.
  assert("wage-only: estimatedNetScheduleC = −500",   s.estimatedNetScheduleC === -500)
  assert("wage-only: estimatedNetScheduleC !== 49500 (would be wrong)",
    s.estimatedNetScheduleC !== 49500)
}

// ── CSV Output Regression ────────────────────────────────────────────────────
// Direct coverage for generateTaxBundleCSV, which page.tsx now delegates to.

function csvHas(csv: string, needle: string, label: string) {
  assert(label, csv.includes(needle), `missing: ${needle}`)
}
function csvLacks(csv: string, needle: string, label: string) {
  assert(label, !csv.includes(needle), `unexpectedly present: ${needle}`)
}

// CSV: clean-baseline (self-employment, no meals, no banners)
{
  const rows: TaxRow[] = [
    businessIncome({ gross: 5000 }),
    expense({ amount: 300, category: "Office" }),
    expense({ amount: 200, category: "Subscriptions" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateTaxBundleCSV(s)

  csvHas(csv, `"Currency",USD`, "csv-clean: currency row present")
  csvHas(csv, "SCHEDULE C SUMMARY", "csv-clean: summary header present")
  csvHas(csv, `Line 18,"Office Expense",300.00,300.00`, "csv-clean: Line 18 raw+deductible")
  csvHas(csv, `Line 22,"Supplies",200.00,200.00`, "csv-clean: Line 22 raw+deductible")
  csvHas(csv, `,"TOTAL (all documented expenses, raw)",500.00,`, "csv-clean: raw total")
  csvHas(csv, `,"DEDUCTIBLE EXPENSES (Schedule C)",,500.00`, "csv-clean: deductible total")
  csvHas(csv, `,"Business Income (income statements — Schedule C base)",5000.00,`,
    "csv-clean: business income row")
  csvHas(csv, `,"Estimated Net (Schedule C, before adjustments)",4500.00,`,
    "csv-clean: estimated net row")
  csvLacks(csv, "Wage Income (payslips", "csv-clean: no wage row")
  csvLacks(csv, "WARNING:", "csv-clean: no warning banner")
  csvLacks(csv, "of which Meals", "csv-clean: no meals footnote")
  // The SE-assumption note IS expected whenever income-statement rows are present.
  csvHas(csv, "ASSUMPTION: income_statement rows", "csv-clean: SE assumption present")
}

// CSV: meals-heavy — meals footnote present
{
  const rows: TaxRow[] = [
    businessIncome({ gross: 10000 }),
    expense({ amount: 200, category: "Meals" }),
    expense({ amount: 100, category: "Business Meals" }),
    expense({ amount: 50,  category: "Office" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateTaxBundleCSV(s)

  csvHas(csv, `Line 24b,"Meals (50% deductible)",300.00,150.00`,
    "csv-meals: Line 24b raw 300 / deductible 150")
  csvHas(csv, `,"  of which Meals (Line 24b) raw",300.00,150.00`,
    "csv-meals: meals footnote")
  csvHas(csv, `,"DEDUCTIBLE EXPENSES (Schedule C)",,200.00`,
    "csv-meals: deductible total = 200")
  csvHas(csv, `,"Estimated Net (Schedule C, before adjustments)",9800.00,`,
    "csv-meals: estimated net = 9800")
}

// CSV: mixed-currency — warning banner at top
{
  const rows: TaxRow[] = [
    businessIncome({ gross: 1000, currency: "USD" }),
    expense({ amount: 100, category: "Office", currency: "USD" }),
    expense({ amount: 50,  category: "Office", currency: "EUR" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateTaxBundleCSV(s)

  csvHas(csv, "WARNING: Mixed currencies detected", "csv-mixed-ccy: warning banner")
  csvHas(csv, "USD, EUR", "csv-mixed-ccy: currencies listed")
  const warningIdx = csv.indexOf("WARNING: Mixed currencies")
  const currencyIdx = csv.indexOf(`"Currency",USD`)
  assert("csv-mixed-ccy: warning appears before currency header", warningIdx >= 0 && warningIdx < currencyIdx)
}

// CSV: mixed-income — wage row + business row both present, estimated net from SE only
{
  const rows: TaxRow[] = [
    payslip({ gross: 80000, net: 60000 }),
    businessIncome({ gross: 20000 }),
    expense({ amount: 1000, category: "Office" }),
    expense({ amount: 400,  category: "Meals" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateTaxBundleCSV(s)

  csvHas(csv, `,"Business Income (income statements — Schedule C base)",20000.00,`,
    "csv-mixed-income: business income = 20000")
  csvHas(csv, `,"Estimated Net (Schedule C, before adjustments)",18800.00,`,
    "csv-mixed-income: estimated net = 18800 (NOT 98800)")
  csvHas(csv, `,"Wage Income (payslips — informational, NOT offset by Schedule C)",80000.00,`,
    "csv-mixed-income: wage row present")
  csvHas(csv, `,"Payroll Deductions (Gross − Net, informational only)",20000.00,`,
    "csv-mixed-income: payroll deductions row")
  csvLacks(csv, "100000.00", "csv-mixed-income: combined gross never surfaces as a deductible base")
}

// CSV: wage-only → negative Sched C warning banner
{
  const rows: TaxRow[] = [
    payslip({ gross: 50000, net: 38000 }),
    expense({ amount: 500, category: "Office" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateTaxBundleCSV(s)

  csvHas(csv, "WARNING: Estimated Net (Schedule C) is negative",
    "csv-wage-only: negative-sched-c warning")
  csvHas(csv, `,"Business Income (income statements — Schedule C base)",0.00,`,
    "csv-wage-only: business income = 0")
  csvHas(csv, `,"Estimated Net (Schedule C, before adjustments)",-500.00,`,
    "csv-wage-only: estimated net = -500 (not clamped)")
  csvLacks(csv, "ASSUMPTION: income_statement", "csv-wage-only: no SE assumption note (no SE rows)")
}

// CSV: employee report -> wage-only worksheet, no Schedule C netting language
{
  const rows: TaxRow[] = [
    payslip({ gross: 50000, net: 38000, employer: "BigCo" }),
    payslip({ gross: 52000, net: 40560, employer: "BigCo" }),
    businessIncome({ gross: 12000, source: "Side Client" }),
  ]
  const s = computeTaxBundle(rows)
  const csv = generateEmployedTaxBundleCSV(s)

  csvHas(csv, "EMPLOYEE INCOME SUMMARY", "csv-employee: summary header")
  csvHas(csv, `,"Gross Wage Income",102000.00`, "csv-employee: wage gross only")
  csvHas(csv, `,"Net Pay Documented",78560.00`, "csv-employee: net pay")
  csvHas(csv, `,"Payroll Deductions (Gross − Net, informational only)",23440.00`,
    "csv-employee: deductions")
  csvHas(csv, `"BigCo",102000.00,78560.00,23440.00,2`, "csv-employee: employer rollup")
  csvHas(csv, "NOTE: This employee report summarizes wage/payslip records only",
    "csv-employee: non-wage exclusion note")
  csvLacks(csv, "Estimated Net (Schedule C", "csv-employee: no Schedule C estimated net")
  csvLacks(csv, "Side Client", "csv-employee: business source excluded from wage audit trail")
  csvLacks(csv, "income-statement", "csv-employee: business document excluded from wage audit trail")
}

// ── Empty input sanity ───────────────────────────────────────────────────────

{
  const s = computeTaxBundle([])
  assert("empty: totalGross = 0",                    s.totalGross === 0)
  assert("empty: deductibleExpenses = 0",            s.deductibleExpenses === 0)
  assert("empty: estimatedNet = 0",                  s.estimatedNetScheduleC === 0)
  assert("empty: no mixedCurrency",                  !s.mixedCurrency)
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error(failures.join("\n"))
  process.exit(1)
}
