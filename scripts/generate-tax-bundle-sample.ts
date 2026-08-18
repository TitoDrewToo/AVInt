// Generate the clean, firm-facing Tax Bundle sample assets.
// Run with: npx tsx scripts/generate-tax-bundle-sample.ts

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { generateQuickBooksCSV, generateXeroCSV, type AccountingExportRow } from "../lib/accounting-csv"
import { computeTaxBundle, generateTaxBundleCSV, getTaxRowAmount, type TaxRow } from "../lib/tax-bundle"

const outputDir = join(process.cwd(), "public/samples/tax-bundle")
mkdirSync(outputDir, { recursive: true })

let id = 0
function row(partial: Partial<TaxRow> & Pick<TaxRow, "document_type">): TaxRow {
  id += 1
  return {
    file_id: `demo-${id}`,
    filename: partial.filename ?? `demo-${id}.pdf`,
    document_type: partial.document_type,
    vendor_name: partial.vendor_name ?? null,
    employer_name: partial.employer_name ?? null,
    document_date: partial.document_date ?? "2026-01-15",
    period_start: partial.period_start ?? null,
    period_end: partial.period_end ?? null,
    total_amount: partial.total_amount ?? null,
    gross_income: partial.gross_income ?? null,
    net_income: partial.net_income ?? null,
    expense_category: partial.expense_category ?? null,
    income_source: partial.income_source ?? null,
    classification_rationale: "Demo fixture: explicitly classified and reviewed.",
    jurisdiction: "US",
    currency: "USD",
    confidence_score: 0.98,
    storage_path: null,
  }
}

const rows: TaxRow[] = [
  row({ document_type: "income_statement", filename: "2026-Q1-business-income.pdf", period_start: "2026-01-01", period_end: "2026-03-31", document_date: "2026-03-31", gross_income: 15000, income_source: "business", employer_name: "Northstar Design Studio" }),
  row({ document_type: "income_statement", filename: "2026-Q2-business-income.pdf", period_start: "2026-04-01", period_end: "2026-06-30", document_date: "2026-06-30", gross_income: 16000, income_source: "business", employer_name: "Northstar Design Studio" }),
  row({ document_type: "income_statement", filename: "2026-Q3-business-income.pdf", period_start: "2026-07-01", period_end: "2026-09-30", document_date: "2026-09-30", gross_income: 17000, income_source: "business", employer_name: "Northstar Design Studio" }),
  row({ document_type: "income_statement", filename: "2026-Q4-business-income.pdf", period_start: "2026-10-01", period_end: "2026-12-31", document_date: "2026-12-31", gross_income: 18000, income_source: "business", employer_name: "Northstar Design Studio" }),
  row({ document_type: "receipt", filename: "2026-01-15-advertising.pdf", document_date: "2026-01-15", vendor_name: "Meta Ads", total_amount: 420, expense_category: "Advertising" }),
  row({ document_type: "invoice", filename: "2026-02-12-contract-labor.pdf", document_date: "2026-02-12", vendor_name: "Mason Reed Consulting", total_amount: 1200, expense_category: "Contract Labor" }),
  row({ document_type: "receipt", filename: "2026-03-18-software.pdf", document_date: "2026-03-18", vendor_name: "Figma", total_amount: 180, expense_category: "Software" }),
  row({ document_type: "invoice", filename: "2026-04-08-office.pdf", document_date: "2026-04-08", vendor_name: "Staples", total_amount: 260, expense_category: "Office Supplies" }),
  row({ document_type: "invoice", filename: "2026-05-05-insurance.pdf", document_date: "2026-05-05", vendor_name: "Hiscox", total_amount: 900, expense_category: "Insurance" }),
  row({ document_type: "receipt", filename: "2026-06-20-travel.pdf", document_date: "2026-06-20", vendor_name: "Delta Air Lines", total_amount: 640, expense_category: "Airfare" }),
  row({ document_type: "receipt", filename: "2026-07-14-meals.pdf", document_date: "2026-07-14", vendor_name: "Union Square Cafe", total_amount: 220, expense_category: "Business Meals" }),
  row({ document_type: "invoice", filename: "2026-08-10-internet.pdf", document_date: "2026-08-10", vendor_name: "Verizon Business", total_amount: 120, expense_category: "Internet" }),
  row({ document_type: "receipt", filename: "2026-09-19-training.pdf", document_date: "2026-09-19", vendor_name: "Coursera", total_amount: 300, expense_category: "Training" }),
  row({ document_type: "receipt", filename: "2026-10-22-marketing.pdf", document_date: "2026-10-22", vendor_name: "LinkedIn Ads", total_amount: 380, expense_category: "Marketing" }),
  row({ document_type: "invoice", filename: "2026-11-11-accounting.pdf", document_date: "2026-11-11", vendor_name: "Clear Ledger CPA", total_amount: 750, expense_category: "Accounting" }),
  row({ document_type: "receipt", filename: "2026-12-03-cloud-services.pdf", document_date: "2026-12-03", vendor_name: "AWS", total_amount: 210, expense_category: "Cloud Services" }),
]

const summary = computeTaxBundle(rows)
if (summary.mixedCurrency || summary.uncategorizedItems.length > 0 || summary.reviewItems.length > 0) throw new Error("Clean demo fixture is not clean")

const accountingRows: AccountingExportRow[] = rows.filter((item) => item.document_type === "receipt" || item.document_type === "invoice").map((item) => ({
  document_date: item.document_date,
  vendor_name: item.vendor_name,
  expense_category: item.expense_category,
  total_amount: getTaxRowAmount(item),
}))

writeFileSync(join(outputDir, "schedule-c.csv"), generateTaxBundleCSV(summary) + "\n")
writeFileSync(join(outputDir, "quickbooks.csv"), generateQuickBooksCSV(accountingRows, "3col") + "\n")
writeFileSync(join(outputDir, "xero.csv"), generateXeroCSV(accountingRows) + "\n")

const lineRows = summary.scheduleC.map((item) => `<tr><td>${item.line}</td><td>${item.label}</td><td>$${item.grossAmount.toFixed(2)}</td><td>$${item.amount.toFixed(2)}</td></tr>`).join("")
const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;margin:42px}h1{font-size:24px;margin:0 0 4px}p{color:#52606d}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border-bottom:1px solid #d9e2ec;padding:8px;text-align:left}th:nth-child(n+3),td:nth-child(n+3){text-align:right}.cards{display:flex;gap:12px;margin-top:20px}.card{border:1px solid #d9e2ec;padding:12px;flex:1}.label{font-size:10px;text-transform:uppercase;color:#52606d}.value{font-size:18px;font-weight:600;margin-top:5px}</style></head><body><h1>Tax Bundle — Schedule C</h1><p>Clean demonstration packet · Northstar Design Studio · 2026 · USD only</p><div class="cards"><div class="card"><div class="label">Business Income</div><div class="value">$${summary.selfEmploymentGross.toFixed(2)}</div></div><div class="card"><div class="label">Proposed Deductible</div><div class="value">$${summary.deductibleExpenses.toFixed(2)}</div></div><div class="card"><div class="label">Estimated Net</div><div class="value">$${summary.estimatedNetScheduleC.toFixed(2)}</div></div></div><h2>Preparer Summary</h2><table><thead><tr><th>Line</th><th>Category</th><th>Raw</th><th>Proposed deductible</th></tr></thead><tbody>${lineRows}</tbody></table><p>Prepared for accountant review or guided transcription. Not tax advice, not a Line 31 calculation, and not a direct-import file.</p></body></html>`
void html
// Keep the sample reproducible on a clean developer machine: this small PDF
// writer avoids requiring a browser or a platform-specific HTML print filter.
function makePdf(lines: string[]) {
  const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
  const content = ["BT", "/F1 11 Tf", "50 760 Td", ...lines.flatMap((line, index) => [index === 0 ? `(${escape(line)}) Tj` : `0 -18 Td (${escape(line)}) Tj`]), "ET"].join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ]
  let pdf = "%PDF-1.4\n"
  const offsets = [0]
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf, "utf8")); pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n` }
  const xref = Buffer.byteLength(pdf, "utf8")
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "utf8")
}

const pdfLines = [
  "Tax Bundle — Schedule C",
  "Clean demonstration packet | Northstar Design Studio | 2026 | USD only",
  "",
  `Business Income: $${summary.selfEmploymentGross.toFixed(2)}`,
  `Proposed Deductible: $${summary.deductibleExpenses.toFixed(2)}`,
  `Estimated Net: $${summary.estimatedNetScheduleC.toFixed(2)}`,
  "",
  "Preparer Summary",
  "Line | Category | Raw | Proposed deductible",
  ...summary.scheduleC.map((item) => `${item.line} | ${item.label} | $${item.grossAmount.toFixed(2)} | $${item.amount.toFixed(2)}`),
  "",
  "Prepared for accountant review or guided transcription. Not tax advice or a Line 31 calculation.",
]
writeFileSync(join(outputDir, "tax-bundle.pdf"), makePdf(pdfLines))

console.log(`Generated clean demo assets in ${outputDir}`)
console.log(`Readiness: 100% (${summary.scheduleC.length} Schedule C lines, ${summary.expenseRows.length} expenses)`)
