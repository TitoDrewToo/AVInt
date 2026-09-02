import assert from "node:assert/strict"
import Module from "node:module"
import path from "node:path"

import { toReportDocument } from "@/lib/report-document"
import { rowsToCsv } from "@/lib/report-row-csv"

// Node 25's tsx CJS resolver does not honor the wildcard export used by the
// renderer's bundled hyphenation package. Production Next/Webpack resolution
// is verified by `pnpm build`; this narrow test shim only makes the pure test
// runner resolve the package's existing file.
const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "@react-pdf/hyphenate/en-us") return path.resolve("node_modules/.pnpm/@react-pdf+hyphenate@0.1.0/node_modules/@react-pdf/hyphenate/lib/en-us.js")
  return resolveFilename.call(this, request, parent, isMain, options)
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderReportPdf, suppressedPlaceholderText } = require("@/lib/report-pdf") as typeof import("@/lib/report-pdf")

const suppressed = { type: "stat" as const, title: "Daily average", value: "", suppressed: true, reason: "Needs 7 covered days; this period has 2." }
const placeholder = suppressedPlaceholderText(suppressed)
assert.equal(placeholder, "STAT — SUPPRESSED: Needs 7 covered days; this period has 2.")
assert.ok(!placeholder.includes("0"), "suppressed blocks must not be represented as zero")

const emptyDocument = {
  title: "Empty report",
  period: { from: "2026-01-01", to: "2026-01-31" },
  generatedAt: "2026-09-01T00:00:00.000Z",
  coverage: { statement: "No records were returned for this period.", complete: false },
  blocks: [],
}
async function main() {
  const emptyPdf = await renderReportPdf(emptyDocument)
  assert.ok(emptyPdf.subarray(0, 5).toString() === "%PDF-", "an empty document must still render a valid PDF")

const taxResult = {
  rows: [],
  summary: {
    primaryCurrency: "USD",
    currencies: [],
    mixedCurrency: false,
    incomeRows: [],
    expenseRows: [],
    wageRows: [],
    wageGross: 0,
    wageNet: 0,
    wagePayrollDeductions: 0,
    selfEmploymentRows: [],
    selfEmploymentGross: 0,
    otherIncomeRows: [],
    otherIncomeGross: 0,
    otherIncomeByType: new Map(),
    totalGross: 0,
    totalPayrollDeductions: 0,
    totalExpensesRaw: 0,
    deductibleExpenses: 0,
    cleanDeductibleExpenses: 0,
    reviewDeductibleExpenses: 0,
    estimatedNetScheduleC: 0,
    mealsGross: 0,
    mealsDeductible: 0,
    scheduleC: [],
    uncategorizedItems: [],
    reviewItems: [],
    incomeByEmployer: new Map(),
    excludedNonUsdRows: [],
    excludedNonUsdByCurrency: new Map(),
    excludedNonUsdRaw: 0,
  },
  totalOwnedDocs: 0,
  detectedYears: [],
  defaultYear: null,
}
const mapped = toReportDocument("tax-bundle", taxResult, { dateFrom: "2026-01-01", dateTo: "2026-01-31" })
assert.equal(mapped.title, "Tax Bundle — Schedule C")
assert.equal(mapped.blocks[0]?.suppressed, true)
assert.match(mapped.coverage?.statement ?? "", /No records/)

for (const [report, result] of [
  ["profit-loss", { incomeRows: [{ document_date: "2026-01-01", gross_income: 100, total_amount: 100, currency: "USD" }], expenseRows: [] }],
  ["income-summary", { income: [{ document_date: "2026-01-01", employer_name: "Acme", total_amount: 100, currency: "USD" }] }],
  ["expense-summary", { expenses: [{ document_date: "2026-01-01", vendor_name: "Shop", total_amount: 25, currency: "USD" }] }],
  ["contract-summary", { contracts: [{ document_date: "2026-01-01", counterparty_name: "Acme", total_amount: 500, currency: "USD" }], obligations: {} }],
  ["key-terms", { docs: [{ document_date: "2026-01-01", counterparty_name: "Acme", total_amount: 500, currency: "USD" }] }],
] as const) {
  const document = toReportDocument(report, result, { dateFrom: "2026-01-01", dateTo: "2026-01-31" })
  assert.ok(document.blocks.some((block) => block.type === "table"), `${report} should produce a table block`)
  assert.match(document.method ?? "", new RegExp(report))
}

const csv = rowsToCsv([{ value: "=SUM(A1)", comma: "a,b", multiline: "a\nb", quote: 'a"b' }])
assert.match(csv, /'=SUM\(A1\)/)
assert.match(csv, /"a,b"/)
assert.match(csv, /"a\nb"/)
assert.match(csv, /"a""b"/)

const mixedRows = {
  incomeRows: [{ document_date: "2026-08-01", gross_income: 50000, total_amount: 50000, currency: "PHP" }],
  expenseRows: [1571.4, 37730, 3200, 120, 5874].map((total_amount) => ({ document_date: "2026-08-02", total_amount, currency: "PHP" })).concat([
    { document_date: "2026-08-03", total_amount: 8.99, currency: "USD" },
    { document_date: "2026-08-04", total_amount: 11, currency: "USD" },
  ]),
}
const mixedDocument = toReportDocument("profit-loss", mixedRows, {})
const mixedKpi = mixedDocument.blocks.find((block) => block.type === "kpi")
assert.equal(mixedKpi?.type, "kpi")
assert.deepEqual(mixedKpi?.items.map((item) => item.label), ["Income · PHP", "Expenses · PHP", "Net · PHP", "Income · USD", "Expenses · USD", "Net · USD"])
assert.ok(!JSON.stringify(mixedDocument).includes("98515.39"), "mixed currencies must not produce a combined figure")
assert.match(JSON.stringify(mixedDocument), /Mixed currencies detected \(PHP, USD\)/)

const phpDocument = toReportDocument("profit-loss", { incomeRows: mixedRows.incomeRows, expenseRows: mixedRows.expenseRows.filter((row) => row.currency === "PHP") }, {})
const phpItems = phpDocument.blocks.find((block) => block.type === "kpi")
assert.deepEqual(phpItems?.type === "kpi" ? phpItems.items : [], [
  { label: "Income · PHP", value: "₱50,000.00" },
  { label: "Expenses · PHP", value: "₱48,495.40" },
  { label: "Net · PHP", value: "₱1,504.60" },
])

const singleDocument = toReportDocument("expense-summary", { expenses: [{ document_date: "2026-08-01", total_amount: 19.99, currency: "USD" }] }, {})
const singleKpi = singleDocument.blocks.find((block) => block.type === "kpi")
assert.deepEqual(singleKpi?.type === "kpi" ? singleKpi.items : [], [{ label: "Total · USD", value: "$19.99" }])

const unspecifiedDocument = toReportDocument("expense-summary", { expenses: [
  { document_date: "2026-08-01", total_amount: 100, currency: "PHP" },
  { document_date: "2026-08-02", total_amount: 10, currency: "USD" },
  { document_date: "2026-08-03", total_amount: 7, currency: null },
] }, {})
const unspecifiedKpi = unspecifiedDocument.blocks.find((block) => block.type === "kpi")
assert.deepEqual(unspecifiedKpi?.type === "kpi" ? unspecifiedKpi.items : [], [
  { label: "Total · PHP", value: "₱100.00" },
  { label: "Total · USD", value: "$10.00" },
  { label: "Total · Unspecified currency", value: "7.00" },
])
assert.match(JSON.stringify(unspecifiedDocument), /Unspecified currency/)
assert.ok(!JSON.stringify(unspecifiedDocument).includes("$17.00"), "unknown-currency amounts must not enter USD totals")

const emptySection = toReportDocument("expense-summary", { expenses: [] }, {})
const emptyKpi = emptySection.blocks.find((block) => block.type === "kpi")
assert.equal(emptyKpi?.suppressed, true)
assert.match(emptyKpi?.reason ?? "", /not stated as zero/)
assert.ok(!JSON.stringify(emptySection).includes('"value":"0"'), "empty sections must not render a zero")

  console.log("report-document tests: 11 passed")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
