import assert from "node:assert/strict"
import * as XLSX from "xlsx"
import { buildDatasetSheet } from "../supabase/functions/_shared/dataset-layer"

function check(name: string, condition: boolean) {
  assert.equal(condition, true, name)
}

const numeric = buildDatasetSheet("Numbers", ["Amount"], [["1,234.50"], ["$99"], ["(45.00)"]])
check("currency and parenthesised values infer as numbers", numeric.columns[0].data_type === "number")
assert.deepEqual(numeric.rows.map((row) => row.data.amount), [1234.5, 99, -45])

const isoDates = buildDatasetSheet("ISO dates", ["Day"], [["2026-01-08"], ["2026-01-09"]])
check("ISO values infer as dates", isoDates.columns[0].data_type === "date")
check("date values remain YYYY-MM-DD", isoDates.rows[0].data.day === "2026-01-08")

const ambiguousDates = buildDatasetSheet("Ambiguous dates", ["Day"], [["03/04/2026"], ["04/05/2026"]])
check("unproven slash order stays text", ambiguousDates.columns[0].data_type === "text")
check("ambiguous dates require review with an actionable reason", ambiguousDates.columns[0].needs_review && Boolean(ambiguousDates.columns[0].review_reason))

const provenDates = buildDatasetSheet("US dates", ["Day"], [["03/14/2026"], ["03/04/2026"]])
check("a day above 12 proves MM/DD order", provenDates.columns[0].data_type === "date" && provenDates.rows[1].data.day === "2026-03-04")

const mixedNumbers = buildDatasetSheet("Mixed", ["Value"], Array.from({ length: 25 }, (_, index) => [index === 24 ? "unknown" : String(index + 1)]))
check("96 percent numeric values infer as numbers", mixedNumbers.columns[0].data_type === "number" && Math.abs((mixedNumbers.columns[0].type_confidence ?? 0) - 0.96) < 0.0001)

const duplicateHeaders = buildDatasetSheet("Headers", ["Order ID", "Order-ID", ""], [["a", "b", "c"]])
assert.deepEqual(duplicateHeaders.columns.map((column) => column.key), ["order_id", "order_id_2", "column_2"])

const blankMiddle = buildDatasetSheet("Blank row", ["Name", "Value"], [["first", 1], [null, null], ["third", 3]])
check("blank middle row is retained", blankMiddle.row_count === 3 && blankMiddle.rows[1].row_index === 1 && blankMiddle.rows[1].data.name === null && blankMiddle.rows[1].data_raw.value === null)

const csvWorkbook = XLSX.read("day,report_date\n2026-08-01,01/02/2026\n", { type: "string", raw: true })
const csvRows = XLSX.utils.sheet_to_json(csvWorkbook.Sheets[csvWorkbook.SheetNames[0]], { header: 1, defval: null, raw: true }) as unknown[][]
const csvDataset = buildDatasetSheet("CSV", csvRows[0], csvRows.slice(1))
check("CSV ISO date reaches inference as text", csvRows[1][0] === "2026-08-01" && csvDataset.columns[0].data_type === "date" && csvDataset.rows[0].data_raw.day === "2026-08-01")
check("CSV ambiguous date reaches inference unchanged", csvRows[1][1] === "01/02/2026" && csvDataset.columns[1].data_type === "text" && csvDataset.columns[1].needs_review)

const xlsxSheet = XLSX.utils.aoa_to_sheet([["day"], [new Date("2026-08-01T00:00:00Z")]])
xlsxSheet.A2.z = "yyyy-mm-dd"
const xlsxWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(xlsxWorkbook, xlsxSheet, "Dates")
const xlsxBuffer = XLSX.write(xlsxWorkbook, { type: "buffer", bookType: "xlsx" })
const typedWorkbook = XLSX.read(xlsxBuffer, { type: "buffer", cellDates: true })
const xlsxRows = XLSX.utils.sheet_to_json(typedWorkbook.Sheets.Dates, { header: 1, defval: null, raw: true }) as unknown[][]
const xlsxDataset = buildDatasetSheet("XLSX", xlsxRows[0], xlsxRows.slice(1))
check("XLSX date cell uses workbook type without ambiguity inference", xlsxRows[1][0] instanceof Date && xlsxDataset.columns[0].data_type === "date" && xlsxDataset.rows[0].data.day === "2026-08-01")

console.log("dataset-layer fixtures: 10 passed")
