import { generateQuickBooksCSV, generateXeroCSV } from "../lib/accounting-csv"

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

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

const quickBooks = generateQuickBooksCSV(rows)
const xero = generateXeroCSV(rows)

assert("QuickBooks has the exact import header", quickBooks.split("\n")[0] === "Date,Description,Amount")
assert("QuickBooks rows are US-date normalized and ordered", quickBooks.includes("01/02/2025,Unknown vendor — Uncategorized,0.00"))
assert("QuickBooks expenses are negative and comma fields are escaped", quickBooks.includes("02/03/2025,\"Acme, Inc. — Software\",-125.50"))
assert("Xero has the exact import header", xero.split("\n")[0] === "Date,Amount,Payee,Description")
assert("Xero expenses use a negative amount and normalized payee", xero.includes("02/03/2025,-125.50,\"Acme, Inc.\",Software"))
assert("Both exports have no blank lines", !quickBooks.includes("\n\n") && !xero.includes("\n\n"))
assert("Xero descriptions are capped at 500 characters", generateXeroCSV([{
  document_date: "2025-03-01",
  vendor_name: "Vendor",
  expense_category: "A".repeat(600),
  total_amount: 1,
}]).split(",").pop()?.length === 500)

console.log("7 passed, 0 failed")
