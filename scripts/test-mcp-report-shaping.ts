import { shapeMcpReportResult } from "../lib/mcp-report-shaping"
import { computeTaxBundle, type TaxRow } from "../lib/tax-bundle"

let passed = 0

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  passed++
  console.log(`✓ ${name}`)
}

const rows: TaxRow[] = Array.from({ length: 1000 }, (_, index) => ({
  file_id: `file-${index}`,
  filename: `receipt-${index}.pdf`,
  document_type: "receipt",
  vendor_name: `Vendor ${index}`,
  employer_name: null,
  document_date: "2025-01-15",
  total_amount: 10,
  gross_income: null,
  net_income: null,
  expense_category: "Office",
  currency: "USD",
  confidence_score: 0.95,
  storage_path: null,
}))

const result = {
  rows,
  totalOwnedDocs: rows.length,
  detectedYears: [2025],
  defaultYear: 2025,
  summary: computeTaxBundle(rows),
}

const compact = shapeMcpReportResult(result)
const compactJson = JSON.stringify(compact)
assert("default report includes only a bounded row sample", compact.rows.length === 20)
assert("default report marks omitted rows", compact.omittedCount === 980 && compact.truncated === true)
assert("default report includes compact counts", compact.summary?.counts.expenseRows === 1000)
assert("default report stays conversation-sized", compactJson.length < 100_000)

const detailed = shapeMcpReportResult(result, true)
assert("includeRows returns full detail explicitly", detailed.rows.length === 1000 && detailed.omittedCount === 0 && detailed.truncated === false)

console.log(`${passed} passed, 0 failed`)
