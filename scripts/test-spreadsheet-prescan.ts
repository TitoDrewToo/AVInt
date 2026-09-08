import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import * as XLSX from "xlsx"

import {
  buildXlsxPreview,
  inspectCsv,
  inspectXlsxArchive,
} from "../supabase/functions/_shared/spreadsheet-prescan"

const bytes = (value: string) => new TextEncoder().encode(value)

function workbookBytes(rows: unknown[][]): Uint8Array {
  const workbook = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(workbook, sheet, "Data")
  return new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
}

function replaceAscii(bytes: Uint8Array, before: string, after: string): Uint8Array {
  assert.equal(before.length, after.length)
  const output = new Uint8Array(bytes)
  const from = new TextEncoder().encode(before)
  const to = new TextEncoder().encode(after)
  for (let index = 0; index <= output.length - from.length; index += 1) {
    if (from.every((value, offset) => output[index + offset] === value)) output.set(to, index)
  }
  return output
}

async function main() {
  const cleanCsv = inspectCsv(bytes('name,amount,note\n"Coffee, Inc",11,"paid\nonsite"\n'))
  assert.equal(cleanCsv.ok, true)
  if (cleanCsv.ok) {
    assert.equal(cleanCsv.rowCount, 2)
    assert.equal(cleanCsv.columnCount, 3)
    assert.match(cleanCsv.preview, /Coffee, Inc/)
  }

  const formulaCsv = inspectCsv(bytes('name,amount\nCoffee,"=HYPERLINK(""https://bad.example"")"\n'))
  assert.deepEqual(formulaCsv, {
    ok: false,
    code: "csv_formula_cell",
    reason: "CSV contains spreadsheet formulas or command-like cells.",
  })

  const malformedCsv = inspectCsv(bytes('name,amount\n"unterminated,11\n'))
  assert.equal(malformedCsv.ok, false)
  if (!malformedCsv.ok) assert.equal(malformedCsv.code, "csv_malformed")
  const controlCsv = inspectCsv(bytes("name,amount\nCoffee,\u0000=CMD()\n"))
  assert.equal(controlCsv.ok, false)
  if (!controlCsv.ok) assert.equal(controlCsv.code, "csv_control_characters")

  const representativeCsv = inspectCsv(bytes(`row,value\n${Array.from({ length: 12 }, (_, index) => `${index + 1},value-${index + 1}`).join("\n")}`))
  assert.equal(representativeCsv.ok, true)
  if (representativeCsv.ok) {
    assert.match(representativeCsv.preview, /value-1/)
    assert.match(representativeCsv.preview, /value-12/)
    assert.ok(representativeCsv.preview.length <= 12_001)
  }

  const cleanWorkbook = workbookBytes([
    ["day", "views"],
    ["2026-09-01", 12],
    ["2026-09-02", 3],
  ])
  const archive = inspectXlsxArchive(cleanWorkbook)
  assert.equal(archive.ok, true)
  if (archive.ok) {
    const replaceable = archive.entries.find((name) => name.length >= "xl/activeX/".length && !["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml"].includes(name))
    assert.ok(replaceable)
    const activeName = `xl/activeX/${"a".repeat(replaceable.length - "xl/activeX/".length)}`
    const activeWorkbook = replaceAscii(cleanWorkbook, replaceable, activeName)
    const activeResult = inspectXlsxArchive(activeWorkbook)
    assert.equal(activeResult.ok, false)
    if (!activeResult.ok) assert.equal(activeResult.code, "xlsx_active_content")
  }

  const preview = await buildXlsxPreview(cleanWorkbook, XLSX)
  assert.equal(preview.ok, true)
  if (preview.ok) {
    assert.equal(preview.sheetCount, 1)
    assert.equal(preview.rowCount, 3)
    assert.equal(preview.columnCount, 2)
    assert.match(preview.preview, /2026-09-01/)
  }

  const formulaWorkbook = XLSX.utils.book_new()
  const formulaSheet = XLSX.utils.aoa_to_sheet([["amount"], [3]])
  formulaSheet.A2 = { t: "n", f: "SUM(1,2)", v: 3 }
  XLSX.utils.book_append_sheet(formulaWorkbook, formulaSheet, "Formulas")
  const formulaWorkbookBytes = new Uint8Array(XLSX.write(formulaWorkbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
  assert.equal(inspectXlsxArchive(formulaWorkbookBytes).ok, true, "ordinary formulas remain allowed")
  const formulaPreview = await buildXlsxPreview(formulaWorkbookBytes, XLSX)
  assert.equal(formulaPreview.ok, true)
  if (formulaPreview.ok) assert.doesNotMatch(formulaPreview.preview, /SUM\(1,2\)/)

  const tooWide = workbookBytes([
    Array.from({ length: 257 }, (_, index) => `column_${index}`),
    Array.from({ length: 257 }, () => "value"),
  ])
  const widePreview = await buildXlsxPreview(tooWide, XLSX)
  assert.equal(widePreview.ok, false)
  if (!widePreview.ok) assert.equal(widePreview.code, "xlsx_too_many_columns")

  const malformedArchive = inspectXlsxArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))
  assert.equal(malformedArchive.ok, false)
  if (!malformedArchive.ok) assert.equal(malformedArchive.code, "xlsx_invalid_archive")

  const stressWorkbook = new Uint8Array(readFileSync(join(process.cwd(), "scripts/test-fixtures/reclassify-stress-test.xlsx")))
  assert.equal(inspectXlsxArchive(stressWorkbook).ok, true)
  assert.equal((await buildXlsxPreview(stressWorkbook, XLSX)).ok, true)
  for (const fixture of ["quickbooks.csv", "schedule-c.csv", "xero.csv"]) {
    const fixtureResult = inspectCsv(new Uint8Array(readFileSync(join(process.cwd(), "public/samples/tax-bundle", fixture))))
    assert.equal(fixtureResult.ok, true, `${fixture} must remain accepted`)
  }

  const prescanSource = readFileSync(join(process.cwd(), "supabase/functions/prescan-document/index.ts"), "utf8")
  assert.equal(prescanSource.includes("Spreadsheets skip safety"), false)
  assert.match(prescanSource, /kind: "tabular_preview"/)
  assert.match(prescanSource, /buildXlsxPreview\(bytes, XLSX\)/)

  console.log("spreadsheet prescan tests: passed")
}

void main()
