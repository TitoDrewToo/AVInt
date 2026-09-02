import assert from "node:assert/strict"
import Module from "node:module"
import path from "node:path"

import { toReportDocument } from "@/lib/report-document"

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

  console.log("report-document tests: 3 passed")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
