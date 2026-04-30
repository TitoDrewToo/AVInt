// Seeds the Smart Storage Reclassify Sheet stress fixture.
//
// Usage:
//   pnpm seed:reclassify <user_email_or_id>
//   pnpm seed:reclassify <user_email_or_id> --reset
//   pnpm seed:reclassify <user_email_or_id> --full-pipeline
//
// Requires NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL, plus SUPABASE_SERVICE_ROLE_KEY.
// The script uses service-role credentials and must stay a local developer tool.

import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const INPUT = process.argv[2]
const RESET = process.argv.includes("--reset")
const FULL_PIPELINE = process.argv.includes("--full-pipeline")
const WRITE_FIXTURE_ONLY = process.argv.includes("--write-fixture-only")
const FILENAME = "reclassify-stress-test.xlsx"
const STORAGE_BUCKET = "documents"
const FIXTURE_PATH = resolve("scripts/test-fixtures", FILENAME)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  if (WRITE_FIXTURE_ONLY) {
    buildWorkbook(buildFixtureRows())
    console.log(`✓ Wrote ${FIXTURE_PATH}`)
    process.exit(0)
  }
  console.error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

if (!INPUT || INPUT.startsWith("--")) {
  if (WRITE_FIXTURE_ONLY) {
    buildWorkbook(buildFixtureRows())
    console.log(`✓ Wrote ${FIXTURE_PATH}`)
    process.exit(0)
  }
  console.error("Usage: pnpm seed:reclassify <user_email_or_id> [--reset] [--full-pipeline]")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

type FixtureRow = {
  sheetName: string
  rowIndex: number
  cells: Record<string, string | number | null>
  extracted: Record<string, unknown>
  confidence: number
  normalizationStatus: "normalized" | "raw" | "excluded"
  normalizationAttempts: number
}

function isoDate(month: number, day: number) {
  return `2025-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function expense(sheetName: string, rowIndex: number, date: string | null, supplier: string, description: string, amount: number | null, currency: string | null, gl: string, category: string | null, confidence = 0.92, status: FixtureRow["normalizationStatus"] = "normalized", attempts = 0): FixtureRow {
  return {
    sheetName,
    rowIndex,
    cells: { Date: date, Supplier: supplier, Description: description, Amount: amount, Currency: currency, "GL Code": gl },
    extracted: {
      vendor_name: supplier,
      document_date: date,
      currency,
      total_amount: amount,
      expense_category: category,
      raw_description: description,
      gl_code: gl,
    },
    confidence,
    normalizationStatus: status,
    normalizationAttempts: attempts,
  }
}

function buildFixtureRows(): FixtureRow[] {
  const rows: FixtureRow[] = []

  const q1Normal = [
    [1, 4, "Starbucks #4421 Seattle", "Coffee w/ client", 14.5, "Meals", "6300-MEALS"],
    [1, 7, "Uber", "Airport ride", 38.2, "Travel", "6400-TRAVEL"],
    [1, 9, "Adobe", "Creative Cloud", 64.99, "Software", "6500-SOFTWARE"],
    [1, 13, "AWS", "Cloud hosting", 412.18, "Software", "6500-SOFTWARE"],
    [1, 16, "Notion Labs", "Workspace subscription", 96, "Software", "6500-SOFTWARE"],
    [1, 18, "Delta Air Lines", "Client trip", 612.4, "Travel", "6400-TRAVEL"],
    [1, 22, "FedEx", "Contract shipment", 47.8, "Office", "6100-OFFICE"],
    [1, 25, "Staples", "Printer supplies", 82.33, "Supplies", "6100-OFFICE"],
    [2, 3, "Figma", "Design workspace", 45, "Software", "6500-SOFTWARE"],
    [2, 6, "Slack", "Team communications", 72, "Software", "6500-SOFTWARE"],
    [2, 8, "WeWork", "Day office", 175, "Rent", "6200-RENT"],
    [2, 12, "Dropbox", "File storage", 19.99, "Software", "6500-SOFTWARE"],
    [2, 15, "LinkedIn", "Sales navigator", 99.99, "Advertising", "6600-MARKETING"],
    [2, 18, "Zoom", "Video meetings", 149.9, "Software", "6500-SOFTWARE"],
    [3, 2, "GitHub", "Developer tools", 48, "Software", "6500-SOFTWARE"],
    [3, 4, "Linear", "Issue tracking", 40, "Software", "6500-SOFTWARE"],
    [3, 9, "Marriott", "Conference lodging", 980, "Travel", "6400-TRAVEL"],
    [3, 12, "Shell", "Rental car fuel", 68.4, "Fuel", "6410-FUEL"],
    [3, 20, "DocuSign", "Contract software", 30, "Software", "6500-SOFTWARE"],
    [3, 24, "OpenAI", "API usage", 188.32, "Software", "6500-SOFTWARE"],
  ] as const
  rows.push(expense("Q1 Expenses", 2, null, "January 2025", "", null, null, "", null, 0.55, "raw", 1))
  q1Normal.slice(0, 8).forEach((r, idx) => rows.push(expense("Q1 Expenses", idx + 3, isoDate(r[0], r[1]), r[2], r[3], r[4], "USD", r[6], r[5])))
  rows.push(expense("Q1 Expenses", 11, isoDate(1, 31), "SUBTOTAL Jan", "-", 1368.4, "USD", "", null, 0.42, "raw", 2))
  rows.push(expense("Q1 Expenses", 12, null, "February 2025", "", null, null, "", null, 0.58))
  q1Normal.slice(8, 14).forEach((r, idx) => rows.push(expense("Q1 Expenses", idx + 13, isoDate(r[0], r[1]), r[2], r[3], r[4], "USD", r[6], r[5])))
  rows.push(expense("Q1 Expenses", 19, isoDate(2, 28), "SUBTOTAL Feb", "-", 561.88, "USD", "", null, 0.44))
  q1Normal.slice(14).forEach((r, idx) => rows.push(expense("Q1 Expenses", idx + 20, isoDate(r[0], r[1]), r[2], r[3], r[4], "USD", r[6], r[5])))
  rows.push(expense("Q1 Expenses", 26, isoDate(3, 31), "SUBTOTAL Mar", "-", 1354.72, "USD", "", null, 0.45))
  rows.push(expense("Q1 Expenses", 27, isoDate(1, 10), "Strabucks", "MISC", 17.2, "USD", "6300-MEALS", "Meals", 0.38))
  rows.push(expense("Q1 Expenses", 28, isoDate(1, 17), "ubre", "MISC", 24.8, "USD", "6400-TRAVEL", "Travel", 0.41))
  rows.push(expense("Q1 Expenses", 29, isoDate(2, 11), "AMZN Mktp", "MISC", 122.1, "USD", "6100-OFFICE", "Office", 0.54))
  rows.push(expense("Q1 Expenses", 30, isoDate(3, 5), "Sq *Cafe", "MISC", 31.4, "USD", "6300-MEALS", "Meals", 0.59))
  rows.push(expense("Q1 Expenses", 31, isoDate(3, 14), "Unknown Vendor", "MISC", 86, "USD", "6999-MISC", null, 0.35, "raw", 1))
  rows.push(expense("Q1 Expenses", 32, isoDate(2, 19), "Petron", "Fuel abroad", 2340, "PHP", "6410-FUEL", "Fuel", 0.86))
  rows.push(expense("Q1 Expenses", 33, isoDate(3, 22), "TotalEnergies", "Fuel abroad", 88.5, "EUR", "6410-FUEL", "Fuel", 0.84))
  rows.push(expense("Q1 Expenses", 34, isoDate(3, 26), "Caltex PH", "Fuel abroad", 1980, "PHP", "6410-FUEL", "Fuel", 0.83))

  for (let i = 0; i < 6; i++) {
    const month = i + 1
    const gross = 7200 + i * 125
    const tax = 1480 + i * 28
    rows.push({
      sheetName: "Payslips",
      rowIndex: i + 2,
      cells: { "Period Start": isoDate(month, 1), "Period End": isoDate(month, 28), Employer: "Acme Corp", Gross: gross, Net: gross - tax, Tax: tax, "Net Pay Date": isoDate(month, 30) },
      extracted: { employer_name: "Acme Corp", document_date: isoDate(month, 30), currency: "USD", gross_income: gross, net_income: gross - tax, tax_amount: tax, income_source: "wage" },
      confidence: 0.94,
      normalizationStatus: "normalized",
      normalizationAttempts: 0,
    })
  }
  rows.push({
    sheetName: "Payslips",
    rowIndex: 8,
    cells: { "Period Start": isoDate(6, 1), "Period End": isoDate(6, 30), Employer: "Refund", Gross: 450, Net: 450, Tax: 0, "Net Pay Date": isoDate(6, 15) },
    extracted: { vendor_name: "Refund", document_date: isoDate(6, 15), currency: "USD", total_amount: 450, expense_category: null },
    confidence: 0.48,
    normalizationStatus: "normalized",
    normalizationAttempts: 0,
  })

  const subscriptions = ["Adobe Creative Cloud", "Notion", "Figma", "Slack", "GitHub", "ChatGPT", "Linear", "Zoom", "Dropbox", "DocuSign", "Canva", "Loom"]
  subscriptions.forEach((vendor, idx) => {
    const category = idx < 8 ? "Software" : null
    rows.push({
      sheetName: "Subscriptions",
      rowIndex: idx + 2,
      cells: { Vendor: vendor, Cycle: idx % 2 === 0 ? "Monthly" : "Annual", Amount: [64.99, 96, 45, 72, 48, 20, 40, 149.9, 19.99, 30, 119.99, 15][idx], Currency: "USD", "Last Charge": isoDate((idx % 6) + 1, 12), Category: category },
      extracted: { vendor_name: vendor, document_date: isoDate((idx % 6) + 1, 12), currency: "USD", total_amount: [64.99, 96, 45, 72, 48, 20, 40, 149.9, 19.99, 30, 119.99, 15][idx], expense_category: category, is_recurring: true },
      confidence: category ? 0.91 : 0.66,
      normalizationStatus: "normalized",
      normalizationAttempts: 0,
    })
  })

  for (let i = 0; i < 8; i++) {
    const isCustomer = i < 5
    rows.push({
      sheetName: "Misc Notes",
      rowIndex: i + 2,
      cells: { Name: isCustomer ? `Customer ${i + 1}` : `Vendor Master ${i - 4}`, Email: `contact${i + 1}@example.com`, Phone: `555-010${i}`, Address: `${100 + i} Market St`, Notes: isCustomer ? "Follow up next quarter" : "Preferred vendor record" },
      extracted: { vendor_name: isCustomer ? `Customer ${i + 1}` : `Vendor Master ${i - 4}`, document_date: null, currency: null, total_amount: null, expense_category: null },
      confidence: 0.31,
      normalizationStatus: "normalized",
      normalizationAttempts: 0,
    })
  }

  rows.push({
    sheetName: "Lease Contract",
    rowIndex: 2,
    cells: { Description: "Lease agreement - Premier Properties Inc", "Due Date": isoDate(1, 1), Amount: null, "Check Number": null, Bank: null },
    extracted: { vendor_name: "Premier Properties Inc", counterparty_name: "Premier Properties Inc", document_date: isoDate(1, 1), currency: "USD", total_amount: null, line_items: [] },
    confidence: 0.9,
    normalizationStatus: "normalized",
    normalizationAttempts: 0,
  })
  for (let i = 0; i < 12; i++) {
    rows.push({
      sheetName: "Lease Contract",
      rowIndex: i + 3,
      cells: { Description: `Rent ${String(i + 1).padStart(2, "0")}/2025`, "Due Date": isoDate(i + 1, 1), Amount: 1500, "Check Number": `PDC-${202500 + i + 1}`, Bank: "BPI" },
      extracted: { vendor_name: "Premier Properties Inc", counterparty_name: "Premier Properties Inc", document_date: isoDate(i + 1, 1), currency: "USD", total_amount: 1500, expense_category: "Rent", line_items: [{ description: `Rent ${i + 1}/2025`, amount: 1500, due_date: isoDate(i + 1, 1), check_number: `PDC-${202500 + i + 1}`, bank_name: "BPI" }] },
      confidence: 0.93,
      normalizationStatus: "normalized",
      normalizationAttempts: 0,
    })
  }
  ;[
    ["Security deposit", isoDate(1, 1), 3000],
    ["Advance rent", isoDate(1, 1), 1500],
    ["Utility deposit", isoDate(1, 10), 500],
    ["Parking setup", isoDate(1, 10), 250],
    ["Key card fee", isoDate(1, 10), 75],
  ].forEach((entry, idx) => {
    rows.push({
      sheetName: "Lease Contract",
      rowIndex: idx + 15,
      cells: { Description: entry[0], "Due Date": entry[1], Amount: entry[2], "Check Number": `PDC-S${idx + 1}`, Bank: "BPI" },
      extracted: { vendor_name: "Premier Properties Inc", counterparty_name: "Premier Properties Inc", document_date: entry[1], currency: "USD", total_amount: entry[2], expense_category: "Rent" },
      confidence: 0.88,
      normalizationStatus: "normalized",
      normalizationAttempts: 0,
    })
  })

  return rows
}

function buildWorkbook(rows: FixtureRow[]) {
  const workbook = XLSX.utils.book_new()
  for (const sheetName of ["Q1 Expenses", "Payslips", "Subscriptions", "Misc Notes", "Lease Contract"]) {
    const sheetRows = rows.filter((row) => row.sheetName === sheetName).map((row) => row.cells)
    const sheet = XLSX.utils.json_to_sheet(sheetRows)
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  }
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
  XLSX.writeFile(workbook, FIXTURE_PATH)
}

async function resolveUser(input: string) {
  if (UUID_RE.test(input)) return { id: input, label: input }
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`User lookup failed: ${error.message}`)
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === input.toLowerCase())
    if (user) return { id: user.id, label: user.email ?? input }
    if (data.users.length < 1000) break
    page++
  }
  throw new Error(`No user found for ${input}`)
}

async function resetFixture(userId: string) {
  const { data: files, error } = await supabase
    .from("files")
    .select("id, storage_path")
    .eq("user_id", userId)
    .eq("filename", FILENAME)
  if (error) throw new Error(`Reset query failed: ${error.message}`)

  for (const file of files ?? []) {
    await supabase.from("document_fields").delete().eq("file_id", file.id)
    await supabase.from("processing_jobs").delete().eq("file_id", file.id)
    if (file.storage_path) await supabase.storage.from(STORAGE_BUCKET).remove([file.storage_path])
    await supabase.from("files").delete().eq("id", file.id)
  }
}

async function triggerFullPipeline(fileId: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/prescan-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ file_id: fileId }),
  })
  if (!res.ok) throw new Error(`prescan-document failed: ${await res.text()}`)
}

async function main() {
  const user = await resolveUser(INPUT)
  const rows = buildFixtureRows()
  buildWorkbook(rows)

  const storagePath = `${user.id}/${FILENAME}`
  const now = new Date().toISOString()
  let fileId: string | null = null

  try {
    if (RESET) console.log(`Resetting prior ${FILENAME} fixture for ${user.label}`)
    await resetFixture(user.id)

    const fileBuffer = readFileSync(FIXTURE_PATH)
    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      })
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

    const sourceRows = rows.map((row, index) => ({
      sheet_name: row.sheetName,
      row_index: row.rowIndex,
      cells: row.cells,
      source_row: row.cells,
      source_index: index,
    }))

    const { data: file, error: fileError } = await supabase
      .from("files")
      .insert({
        user_id: user.id,
        filename: FILENAME,
        storage_path: storagePath,
        file_type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        file_size: fileBuffer.length,
        document_type: "csv_export",
        upload_status: FULL_PIPELINE ? "pending_scan" : "done",
        folder_id: null,
        source_rows_json: sourceRows,
        analysis_json: null,
        analyzed_at: null,
      })
      .select("id")
      .single()
    if (fileError || !file) throw new Error(`File insert failed: ${fileError?.message ?? "no row returned"}`)
    fileId = file.id

    const completedAt = FULL_PIPELINE ? null : now
    const { error: jobError } = await supabase
      .from("processing_jobs")
      .insert({
        file_id: fileId,
        status: FULL_PIPELINE ? "uploaded" : "completed",
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        completed_at: completedAt,
      })
    if (jobError) throw new Error(`processing_jobs insert failed: ${jobError.message}`)

    if (FULL_PIPELINE) {
      await triggerFullPipeline(fileId)
      console.log(`✓ Uploaded fixture for full pipeline test for user ${user.label}`)
      console.log(`✓ file_id: ${fileId}`)
      console.log("✓ prescan-document invoked; document_fields will be produced by the real pipeline")
      console.log("Open: https://www.avintph.com/tools/smart-storage")
      return
    }

    const fieldRows = rows.map((row, index) => ({
      file_id: fileId,
      vendor_name: row.extracted.vendor_name ?? null,
      employer_name: row.extracted.employer_name ?? null,
      document_date: row.extracted.document_date ?? null,
      currency: row.extracted.currency ?? null,
      total_amount: row.extracted.total_amount ?? null,
      gross_income: row.extracted.gross_income ?? null,
      net_income: row.extracted.net_income ?? null,
      tax_amount: row.extracted.tax_amount ?? null,
      expense_category: row.extracted.expense_category ?? null,
      income_source: row.extracted.income_source ?? null,
      payment_method: row.extracted.payment_method ?? null,
      counterparty_name: row.extracted.counterparty_name ?? null,
      confidence_score: row.confidence,
      normalization_status: row.normalizationStatus,
      normalization_attempts: row.normalizationAttempts,
      normalization_version: 3,
      normalized_at: row.normalizationStatus === "normalized" ? now : null,
      raw_json: {
        gemini_raw: row.extracted,
        source_index: index,
        source_sheet: row.sheetName,
        source_row: sourceRows[index],
        is_recurring: row.extracted.is_recurring ?? false,
      },
      line_items: row.extracted.line_items ?? null,
    }))

    const { error: fieldsError } = await supabase.from("document_fields").insert(fieldRows)
    if (fieldsError) throw new Error(`document_fields insert failed: ${fieldsError.message}`)

    const excluded = fieldRows.filter((row) => row.normalization_status === "excluded").length
    const lowConfidence = fieldRows.filter((row) => Number(row.confidence_score) < 0.7).length

    console.log(`✓ Seeded fixture for user ${user.label}`)
    console.log(`✓ file_id: ${fileId}`)
    console.log(`✓ ${fieldRows.length} document_fields rows (${excluded} excluded, ${lowConfidence} low-confidence)`)
    console.log("Open: https://www.avintph.com/tools/smart-storage")
    console.log(`Right-click the "${FILENAME}" file → Reclassify Sheet`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`Seed failed${fileId ? ` for file_id ${fileId}` : ""}: ${message}`)
    if (fileId) {
      await supabase.from("document_fields").delete().eq("file_id", fileId)
      await supabase.from("processing_jobs").delete().eq("file_id", fileId)
      await supabase.from("files").delete().eq("id", fileId)
    }
    await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
    process.exit(1)
  }
}

if (!existsSync(FIXTURE_PATH)) {
  mkdirSync(dirname(FIXTURE_PATH), { recursive: true })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
