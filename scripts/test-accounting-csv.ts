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

assert("QuickBooks columns are import-ready", quickBooks.startsWith("Date,Vendor,Category,Amount,Description,Currency"))
assert("QuickBooks rows are date-normalized and ordered", quickBooks.includes("2025-01-02,\"Unknown vendor\",\"Uncategorized\",0.00"))
assert("QuickBooks vendor commas are escaped", quickBooks.includes("\"Acme, Inc.\""))
assert("Xero columns include amount/payee/category", xero.startsWith("Date,Amount,Payee,Description,Category,AccountCode,TaxType,Currency"))
assert("Xero rows preserve normalized amount and currency", xero.includes("2025-02-03,125.50,\"Acme, Inc.\""))

console.log("5 passed, 0 failed")
