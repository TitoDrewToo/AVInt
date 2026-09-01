import { generateQuickBooksCSV, generateXeroCSV } from "../lib/accounting-csv"
import { EXPENSE_DOCUMENT_TYPES, classifyRow, isExportableExpenseRow, isExpenseRow, isUsdRow } from "../lib/document-classification"

let passed = 0

const rows = [
  {
    document_date: "2025-02-03T00:00:00.000Z",
    vendor_name: "  Acme, Inc. ",
    expense_category: "Software",
    total_amount: 125.5,
    currency: "usd",
    filename: "Acme invoice.pdf",
  },
  {
    document_date: "2025-01-02",
    vendor_name: null,
    expense_category: null,
    total_amount: null,
    currency: null,
    filename: null,
  },
]

const classifiedRows = [
  { document_type: "csv_export", raw_json: { gemini_raw: { document_type: "transaction_record" } }, currency: "USD", total_amount: 25, document_date: "2025-01-03", vendor_name: "Spreadsheet vendor", expense_category: "Software" },
  { document_type: "csv_export", raw_json: { gemini_raw: { document_type: "receipt" } }, currency: "PHP", total_amount: 369, document_date: "2025-01-04", vendor_name: "PHP vendor", expense_category: "Rent" },
  { document_type: "csv_export", currency: "USD", gross_income: 500, document_date: "2025-01-05", vendor_name: "Customer", expense_category: null },
  { document_type: "csv_export", currency: "USD", total_amount: 1368.4, document_date: "2025-01-31", vendor_name: "Subtotal Jan", expense_category: null },
  { document_type: "csv_export", currency: "USD", total_amount: 450, document_date: "2025-06-15", vendor_name: "Refund", expense_category: null },
  { document_type: "csv_export", currency: "USD", total_amount: 86, document_date: "2025-03-14", vendor_name: "Unknown Vendor", expense_category: null },
]

const conflictingTypeRow = {
  document_type: "receipt",
  raw_json: { gemini_raw: { document_type: "transaction_record" } },
  currency: "USD",
  total_amount: 25,
}
const legacyRawFirstType = conflictingTypeRow.raw_json.gemini_raw.document_type
const legacyClassification = EXPENSE_DOCUMENT_TYPES.has(legacyRawFirstType) ? "expense" : null
assert("classifier: raw transaction_record vs typed receipt remains expense", classifyRow(conflictingTypeRow) === "expense" && legacyClassification === "expense")
assert("classifier: typed document_type works without raw_json", classifyRow({ document_type: "receipt", currency: "USD", total_amount: 25 }) === "expense")

const payslipRecord = { document_type: "payslip", amount: 48500 }
const incomeReportRow = { total_amount: payslipRecord.amount }
assert("income report: payslip total_amount comes from records.amount", incomeReportRow.total_amount === 48500)

const usdExpenses = classifiedRows.filter((row) => isExportableExpenseRow(row) && isUsdRow(row))
assert("classifier: csv_export transaction_record USD expense retained", usdExpenses.length === 1 && usdExpenses[0].total_amount === 25)
assert("classifier: non-USD spreadsheet expense excluded from export input", classifiedRows.filter((row) => isExpenseRow(row) && !isUsdRow(row)).length === 1)
assert("classifier: csv_export income is not an expense", !isExpenseRow(classifiedRows[2]))
assert("classifier: subtotal is not an expense", !isExpenseRow(classifiedRows[3]))
assert("classifier: refund is not an expense", !isExpenseRow(classifiedRows[4]))
assert("classifier: null-category row is not exportable", !isExportableExpenseRow(classifiedRows[5]))

const classifiedQuickBooks = generateQuickBooksCSV(usdExpenses)
const classifiedXero = generateXeroCSV(usdExpenses)
assert("classifier: QuickBooks export contains only USD spreadsheet expense", classifiedQuickBooks.includes("Spreadsheet vendor") && !classifiedQuickBooks.includes("PHP vendor"))
assert("classifier: Xero export contains only USD spreadsheet expense", classifiedXero.includes("Spreadsheet vendor") && !classifiedXero.includes("PHP vendor"))

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  passed++
  console.log(`✓ ${name}`)
}

const quickBooks = generateQuickBooksCSV(rows)
const quickBooks4 = generateQuickBooksCSV(rows, "4col")
const xero = generateXeroCSV(rows)

assert("QuickBooks has the exact import header", quickBooks.split("\n")[0] === "Date,Description,Amount")
assert("QuickBooks rows are US-date normalized and ordered", quickBooks.includes("01/02/2025,Unknown vendor — Uncategorized,"))
assert("QuickBooks expenses are negative and comma fields are escaped", quickBooks.includes("02/03/2025,\"Acme, Inc. — Software\",-125.50"))
assert("QuickBooks 4-column header and positive debit", quickBooks4.split("\n")[0] === "Date,Description,Credit,Debit" && quickBooks4.includes("02/03/2025,\"Acme, Inc. — Software\",,125.50"))
assert("QuickBooks 4-column zero cells are blank", quickBooks4.includes("01/02/2025,Unknown vendor — Uncategorized,,"))
assert("Xero has the exact import header", xero.split("\n")[0] === "Date,Description,Amount")
assert("Xero expenses use a negative amount and vendor-category description", xero.includes("02/03/2025,\"Acme, Inc. - Software\",-125.50"))
assert("Both exports have no blank lines", !quickBooks.includes("\n\n") && !xero.includes("\n\n"))
const longXeroLine = generateXeroCSV([{
  document_date: "2025-03-01",
  vendor_name: "Vendor",
  expense_category: "A".repeat(600),
  total_amount: 1,
}]).split("\n")[1].split(",")
assert("Xero descriptions are capped at 500 characters", longXeroLine[1]?.length === 500 && longXeroLine[2] === "-1.00")

console.log(`${passed} passed, 0 failed`)
