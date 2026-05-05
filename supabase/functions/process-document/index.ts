import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { logError, logEvent } from "../_shared/log.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"

const FN = "process-document"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const PROCESS_PROVIDERS = providerChain("PROCESS", "gemini", "openai")

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.avintph.com,https://avintph.com").split(",").map(s => s.trim())
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? ""
  const allow = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  }
}

const EXTRACTION_PROMPT = `You are a document extraction AI. Analyze this document and extract structured data.

MULTI-SHEET / MULTI-ROW DETECTION (read this first):

If the input text contains ANY of the following:
  a) Two or more lines that begin with "# Sheet:" markers, OR
  b) A repeating tabular structure (header row followed by 2+ data rows
     of similar shape)

THEN you MUST return a TOP-LEVEL JSON ARRAY where each element is one
document object (one per row of data). Each object follows the same
field schema described below.

Do NOT collapse multiple data rows into a single document's "line_items"
field. The line_items field is reserved for sub-items WITHIN a single
transaction (e.g., a single receipt's individual purchases, or a
contract's payment-schedule entries). It is NOT for separate rows in a
spreadsheet.

Example:
- A 50-row CSV of expense transactions -> return a 50-element array.
- A multi-sheet workbook with 30 rows in Sheet 1 and 20 rows in
  Sheet 2 -> return a 50-element array (one element per row across all sheets).
- A single receipt with 5 line items -> return a single object with
  line_items = [5 sub-items].

If the input is genuinely a single document (one PDF receipt, one
contract scan, etc.) WITHOUT multiple sheet markers and without a
repeating row structure, return a single JSON object as before.

CRITICAL FORMATTING RULES:
1. Return ONLY JSON — either a single JSON object for a single document, or a top-level JSON array for multi-sheet/multi-row spreadsheet data.
2. For multi-sheet/multi-row spreadsheet data, the response MUST start with [ and end with ].
3. For a genuinely single document, the response MUST start with { and end with }.
4. No markdown, no code blocks, no explanation — just the JSON.
5. If a single document has multiple line items, put them inside the "line_items" array field.

Extract these fields:
{
  "document_type": "receipt|invoice|payslip|income_statement|bank_statement|transaction_record|contract|agreement|tax_document|general_document",
  "vendor_name": "string or null — store/company name shown on the document",
  "employer_name": "string or null — employer name for payslips",
  "document_date": "YYYY-MM-DD or null — date printed on the document",
  "currency": "USD|PHP|SGD|EUR|GBP|etc or null — currency of the amounts",
  "total_amount": number or null,
  "gross_income": number or null,
  "net_income": number or null,
  "expense_category": "Food|Transport|Housing|Utilities|Healthcare|Entertainment|Shopping|Travel|Office|Salary|Other or null",
  "line_items": [{"description": "string", "amount": number, "due_date": "YYYY-MM-DD or null", "check_number": "string or null", "bank_name": "string or null"}],
  "confidence": number between 0 and 1
}

Rules:
- document_type must be one of the exact values listed
- dates must be ISO format YYYY-MM-DD
- amounts must be numbers not strings
- For receipts/invoices: vendor_name is the store/restaurant/company issuing the document
- For screenshots of receipts: read the store name from the header of the receipt
- confidence reflects how certain you are about the extraction
- if a field cannot be determined return null
- line_items should be an empty array [] if no line items found, never null

SPECIAL RULE — Contracts and lease agreements:
If the document is a contract or agreement that contains a payment schedule table (e.g. post-dated checks, installment plan, rent payment calendar), extract every row of that table into line_items. For each payment entry use:
  - description: label or purpose (e.g. "Rent - April 2026", "Installment 1", or blank if unlabeled)
  - amount: the payment amount as a number
  - due_date: the due/payment date in YYYY-MM-DD format
  - check_number: the check or reference number if present (string), otherwise null
  - bank_name: the bank name printed on the check or schedule if present (string), otherwise null
Philippine PDC (post-dated check) schedules are common — scan all pages for these tables.`

const HEADER_MAPPING_PROMPT = `You are a spreadsheet header mapper for a financial document system.

Given column headers from one sheet of a spreadsheet, map each header to one of these canonical fields, then infer the document_type for the sheet.

Canonical fields:
- vendor_name, employer_name, document_date, currency, total_amount
- gross_income, net_income, tax_amount, discount_amount, expense_category
- payment_method, invoice_number, period_start, period_end, counterparty_name
- line_item_description, line_item_amount, line_item_due_date, line_item_check_number, line_item_bank_name

Special directives:
- "ignore"  -> header should not be captured (row numbers, internal IDs, blank columns)
- "custom"  -> header is preserved in raw_json but doesn't map to canonical schema (e.g., "GL Code", "Cost Center", "Project ID")

document_type values: receipt | invoice | payslip | income_statement | bank_statement | transaction_record | contract | agreement | tax_document | general_document

Return ONLY a JSON object, no markdown, no explanation:
{
  "mapping": { "<header>": "<canonical_field|ignore|custom>", ... },
  "document_type": "<one of the values above>"
}`

const DOCUMENT_TYPES = new Set([
  "receipt",
  "invoice",
  "payslip",
  "income_statement",
  "bank_statement",
  "transaction_record",
  "contract",
  "agreement",
  "tax_document",
  "general_document",
])

const NUMERIC_FIELDS = ["total_amount", "gross_income", "net_income", "tax_amount", "discount_amount"]

function isSpreadsheetInput(mimeType: string, filename: string): boolean {
  return mimeType === "text/csv" ||
         mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
         /\.(xlsx|csv)$/i.test(filename ?? "")
}

function isBlankCell(value: unknown): boolean {
  return value === null || value === undefined || value === ""
}

function isGarbageRow(cells: Record<string, any>): boolean {
  const values = Object.values(cells).filter((value) => !isBlankCell(value))
  if (values.length === 0) return true

  const hasSubtotalMarker = values.some((value) =>
    typeof value === "string" && /\b(sub-?total|grand\s*total|total)\b/i.test(value)
  )
  if (hasSubtotalMarker && values.length < 4) return true

  return false
}

function normalizeExtractedDocumentType(row: any, mimeType: string): string {
  const documentType = row?.document_type ?? "general_document"
  const looksLikeReceiptScreenshot =
    mimeType.startsWith("image/") &&
    ["transaction_record", "general_document"].includes(documentType) &&
    !!row?.vendor_name &&
    row?.total_amount !== null &&
    row?.total_amount !== undefined &&
    !!row?.document_date &&
    !row?.gross_income &&
    !row?.net_income

  if (looksLikeReceiptScreenshot) return "receipt"
  return documentType
}

function openAiInputPart(mimeType: string, base64: string, bytes: Uint8Array) {
  if (mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: "document.pdf",
      file_data: base64,
    }
  }
  if (mimeType.startsWith("image/")) {
    return {
      type: "input_image",
      image_url: `data:${mimeType};base64,${base64}`,
    }
  }
  if (mimeType.startsWith("text/")) {
    return {
      type: "input_text",
      text: new TextDecoder("utf-8").decode(bytes).slice(0, 120_000),
    }
  }
  return null
}

function toBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function parseExtractionRows(rawText: string): any[] {
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()

  if (stripped.startsWith("[")) {
    const parsed = JSON.parse(stripped)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  const objectMatch = stripped.match(/\{[\s\S]*\}/)
  if (!objectMatch) throw new Error("No JSON object found in response")
  return [JSON.parse(objectMatch[0])]
}

function parseHeaderMappingResponse(rawText: string): any {
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  try {
    return JSON.parse(stripped)
  } catch {
    const objectMatch = stripped.match(/\{[\s\S]*\}/)
    if (!objectMatch) throw new Error("No JSON object found in header mapping response")
    return JSON.parse(objectMatch[0])
  }
}

function fallbackKeywordMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const header of headers) {
    const lower = header.toLowerCase()
    if (/date/.test(lower) && !/due|period/.test(lower)) map[header] = "document_date"
    else if (/period.*start|start.*date/.test(lower)) map[header] = "period_start"
    else if (/period.*end|end.*date/.test(lower)) map[header] = "period_end"
    else if (/due/.test(lower)) map[header] = "line_item_due_date"
    else if (/vendor|supplier|merchant|payee/.test(lower)) map[header] = "vendor_name"
    else if (/employer|company/.test(lower)) map[header] = "employer_name"
    else if (/counterparty|landlord|lessor|client/.test(lower)) map[header] = "counterparty_name"
    else if (/(total|amount|cost|price)/.test(lower) && !/tax|discount|gross|net/.test(lower)) map[header] = "total_amount"
    else if (/gross/.test(lower)) map[header] = "gross_income"
    else if (/net/.test(lower)) map[header] = "net_income"
    else if (/tax/.test(lower)) map[header] = "tax_amount"
    else if (/discount/.test(lower)) map[header] = "discount_amount"
    else if (/currency/.test(lower)) map[header] = "currency"
    else if (/category|expense.*type|gl.*code/.test(lower)) map[header] = "expense_category"
    else if (/payment.*method|method/.test(lower)) map[header] = "payment_method"
    else if (/invoice.*(number|#|ref)|reference|receipt/.test(lower)) map[header] = "invoice_number"
    else if (/check.*(number|no|#)/.test(lower)) map[header] = "line_item_check_number"
    else if (/bank/.test(lower)) map[header] = "line_item_bank_name"
    else if (/description|particular|item|note/.test(lower)) map[header] = "line_item_description"
    else map[header] = "custom"
  }
  return map
}

function applyMapping(
  cells: Record<string, any>,
  mapping: Record<string, string>,
  documentType: string,
): any {
  const canonical: any = {
    document_type: DOCUMENT_TYPES.has(documentType) ? documentType : "general_document",
    line_items: [],
  }
  const customFields: Record<string, any> = {}

  for (const [header, value] of Object.entries(cells)) {
    if (isBlankCell(value)) continue
    const target = mapping[header]
    if (!target || target === "ignore") continue
    if (target === "custom") {
      customFields[header] = value
      continue
    }
    if (target.startsWith("line_item_")) {
      if (canonical.line_items.length === 0) canonical.line_items.push({})
      canonical.line_items[0][target.replace("line_item_", "")] = value
      continue
    }
    canonical[target] = value
  }

  for (const numField of NUMERIC_FIELDS) {
    if (canonical[numField] != null && typeof canonical[numField] === "string") {
      const cleaned = canonical[numField].replace(/[,$£€₱\s]/g, "")
      const parsed = parseFloat(cleaned)
      if (!Number.isNaN(parsed)) canonical[numField] = parsed
    }
  }

  canonical.confidence = 0.95
  if (Object.keys(customFields).length > 0) canonical._custom_fields = customFields

  return canonical
}

async function mapHeadersForSheet(
  sheetName: string,
  headers: string[],
  sampleRows: any[][],
): Promise<{ mapping: Record<string, string>; document_type: string }> {
  const userInput = JSON.stringify({
    sheet_name: sheetName,
    headers,
    sample_rows: sampleRows.slice(0, 3),
  })

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: HEADER_MAPPING_PROMPT },
            { text: "\n\nINPUT:\n" + userInput },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    },
    30_000,
  )

  if (!res.ok) throw new Error(`Header mapping API error: ${await res.text()}`)

  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  if (!rawText) throw new Error("No response from Gemini header mapping")

  const parsed = parseHeaderMappingResponse(rawText)
  const documentType = DOCUMENT_TYPES.has(parsed.document_type) ? parsed.document_type : "general_document"
  return {
    mapping: parsed.mapping ?? {},
    document_type: documentType,
  }
}

async function extractSpreadsheetRows(
  bytes: Uint8Array,
  mimeType: string,
  filename: string,
  fileId: string,
): Promise<{ extractedRows: any[]; sourceRows: any[] }> {
  const XLSX = await import("https://esm.sh/xlsx@0.18.5")
  const isCsv = mimeType === "text/csv" || /\.csv$/i.test(filename ?? "")
  const workbook = isCsv
    ? XLSX.read(new TextDecoder().decode(bytes), { type: "string" })
    : XLSX.read(bytes, { type: "array" })

  const extractedRows: any[] = []
  const sourceRows: any[] = []
  let sourceIndex = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]

    if (rawRows.length < 2) continue

    const headerEntries = (rawRows[0] ?? [])
      .map((header: any, index: number) => ({ header: String(header ?? "").trim(), index }))
      .filter((entry: { header: string; index: number }) => entry.header.length > 0)
    const headers = headerEntries.map((entry: { header: string }) => entry.header)
    if (headers.length === 0) continue

    const dataRows = rawRows.slice(1)
    const sampleForMapping = dataRows
      .filter((row) => row.some((cell) => !isBlankCell(cell)))
      .slice(0, 3)
      .map((row) => headerEntries.map((entry: { index: number }) => row[entry.index] ?? null))

    let mapping: Record<string, string> = {}
    let documentType = "general_document"
    try {
      const result = await mapHeadersForSheet(sheetName, headers, sampleForMapping)
      mapping = result.mapping
      documentType = result.document_type
    } catch (err: any) {
      logError(FN, "header_mapping_failed", err, { file_id: fileId, sheet: sheetName })
      mapping = fallbackKeywordMapping(headers)
    }

    for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex++) {
      const row = dataRows[rowIndex]
      const cells: Record<string, any> = {}
      for (const entry of headerEntries) {
        cells[entry.header] = row[entry.index] ?? null
      }

      if (isGarbageRow(cells)) continue

      const canonical = applyMapping(cells, mapping, documentType)
      canonical._source_sheet = sheetName
      canonical._source_index = sourceIndex
      extractedRows.push(canonical)
      sourceRows.push({
        sheet_name: sheetName,
        row_index: rowIndex + 2,
        cells,
      })
      sourceIndex++
    }
  }

  if (extractedRows.length === 0) {
    throw new Error("No data rows extracted from any sheet. Header mapping or row detection failed across all sheets.")
  }

  return { extractedRows, sourceRows }
}

async function callGeminiExtraction(mimeType: string, base64: string): Promise<string> {
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: EXTRACTION_PROMPT },
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
        }
      })
    },
    60_000,
  )

  if (!res.ok) {
    throw new Error(`Gemini API error: ${await res.text()}`)
  }

  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) throw new Error("No response from Gemini")
  return rawText
}

async function callOpenAIExtraction(mimeType: string, base64: string, bytes: Uint8Array): Promise<string> {
  const filePart = openAiInputPart(mimeType, base64, bytes)
  if (!filePart) throw new Error(`OpenAI process does not support MIME type ${mimeType}`)

  const res = await fetchWithTimeout(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: [{
          role: "user",
          content: [
            filePart,
            { type: "input_text", text: EXTRACTION_PROMPT },
          ],
        }],
        temperature: 0.1,
        max_output_tokens: 8192,
      }),
    },
    60_000,
  )

  if (!res.ok) {
    throw new Error(`OpenAI process API error: ${await res.text()}`)
  }

  const data = await res.json()
  const rawText =
    data.output_text ??
    data.output?.flatMap((item: any) => item.content ?? []).find((part: any) => part.type === "output_text")?.text ??
    ""
  if (!rawText) throw new Error("No response from OpenAI")
  return rawText
}

async function callExtractionWithFallback(
  mimeType: string,
  base64: string,
  bytes: Uint8Array,
): Promise<{ rawText: string; provider: AiProvider }> {
  let lastError: unknown = null
  for (const provider of PROCESS_PROVIDERS) {
    try {
      let rawText = ""
      if (provider === "gemini") rawText = await callGeminiExtraction(mimeType, base64)
      else if (provider === "openai") rawText = await callOpenAIExtraction(mimeType, base64, bytes)
      else throw new Error(`Unsupported process provider: ${provider}`)
      return { rawText, provider }
    } catch (error) {
      lastError = error
      logError(FN, "provider_failed", error, { provider })
      if (!isProviderFailure(error)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All process providers failed")
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  let authorizedUserId: string | null = null
  const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY
  if (!isServiceRole) {
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    authorizedUserId = userData.user.id
  }

  // Read body once and store
  let body: any = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or empty request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const { file_id, job_id } = body
    logEvent(FN, "received", { file_id, job_id })

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 2. Get file record
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single()

    if (fileError || !file) throw new Error("File not found")

    if (!isServiceRole && file.user_id !== authorizedUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Phase B gate: only proceed on approved or legacy uploaded rows.
    // approved → passed prescan, safe to OCR.
    // uploaded → legacy pre-Phase-B rows (backward compat, retire after backfill).
    if (!["approved", "uploaded"].includes(file.upload_status)) {
      return new Response(
        JSON.stringify({ error: "File not approved for processing", current_status: file.upload_status }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // 1. Mark active job for this file as processing.
    // Prescan does not pass job_id through the chain, so we look up the latest
    // job for the file by file_id. One active job per file in practice.
    await supabase
      .from("processing_jobs")
      .update({ status: "processing" })
      .eq("file_id", file_id)
      .in("status", ["uploaded", "processing"])

    // 3. Download file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("documents")
      .download(file.storage_path)

    if (downloadError || !fileData) throw new Error("Failed to download file")

    // 4. Read file bytes.
    const arrayBuffer = await fileData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let mimeType = file.file_type || "application/pdf"
    let extractedRows: any[] = []
    let sourceRows: any[] | null = null
    let extractionProvider: AiProvider | "deterministic" = "gemini"
    let isCsv = false

    // 4b. Spreadsheet extraction.
    // SheetJS deterministically splits spreadsheet rows; AI only maps headers.
    if (isSpreadsheetInput(mimeType, file.filename ?? "")) {
      try {
        const spreadsheetResult = await extractSpreadsheetRows(uint8Array, mimeType, file.filename ?? "", file_id)
        extractedRows = spreadsheetResult.extractedRows
        sourceRows = spreadsheetResult.sourceRows
        extractionProvider = "deterministic"
        isCsv = true

        await supabase
          .from("files")
          .update({ source_rows_json: sourceRows })
          .eq("id", file_id)

        logEvent(FN, "spreadsheet_extracted_deterministically", {
          file_id,
          extracted_rows: extractedRows.length,
          source_rows: sourceRows.length,
        })
      } catch (e: any) {
        throw new Error(`spreadsheet extraction failed: ${e.message}`)
      }
    } else {
      const base64 = toBase64(uint8Array)
      const { rawText, provider } = await callExtractionWithFallback(mimeType, base64, uint8Array)
      extractionProvider = provider

      try {
        // Top-level array = CSV export; top-level object = single document.
        // IMPORTANT: use startsWith('[') to detect arrays because document objects
        // can contain arrays inside line_items.
        extractedRows = parseExtractionRows(rawText)
      } catch {
        throw new Error(`Failed to parse extraction output: ${rawText}`)
      }
    }

    if (extractedRows.length === 0) {
      throw new Error("No rows extracted from document")
    }

    const extracted = extractedRows[0]
    isCsv = isCsv || extractedRows.length > 1

    // 8. Update files.document_type
    // For CSVs use the first row's type; mark as csv_export for clarity
    await supabase
      .from("files")
      .update({
        document_type: isCsv ? "csv_export" : normalizeExtractedDocumentType(extracted, mimeType),
        upload_status: "done",
      })
      .eq("id", file_id)

    // 9. Insert all rows into document_fields
    const rowsToInsert = extractedRows.map((row: any, index: number) => {
      const sourceIndex = row._source_index ?? index
      const sourceRow = sourceRows?.[sourceIndex] ?? null

      return {
        file_id,
        vendor_name:          row.vendor_name      ?? null,
        employer_name:        row.employer_name    ?? null,
        document_date:        row.document_date    ?? null,
        currency:             row.currency         ?? null,
        total_amount:         row.total_amount     ?? null,
        gross_income:         row.gross_income     ?? null,
        net_income:           row.net_income       ?? null,
        expense_category:     row.expense_category ?? null,
        confidence_score:     row.confidence       ?? 0.95,
        // gemini_raw is the legacy compatibility key consumed by normalization prompts.
        raw_json:             {
          gemini_raw: row,
          extraction_provider: row._extraction_provider ?? extractionProvider,
          source_sheet: row._source_sheet ?? sourceRow?.sheet_name ?? null,
          source_index: sourceIndex,
          source_row: sourceRow,
          custom_fields: row._custom_fields ?? null,
        },
        normalization_status: "raw",
      }
    })

    const { data: insertedRows } = await supabase
      .from("document_fields")
      .insert(rowsToInsert)
      .select("*")

    // 10. Call normalize-document for each row
    // CSVs have multiple rows — normalize each individually using inline fields
    const rowsForNormalization = insertedRows ?? []
    const normalizeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/normalize-document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          file_id,
          job_id: rowsForNormalization.length === 1 ? job_id : undefined,
          fields: rowsForNormalization.length === 1 ? rowsForNormalization[0] : undefined,
        }),
      }
    )

    // For CSV multi-row: normalize remaining rows in parallel (fire and forget)
    if (rowsForNormalization.length > 1) {
      const normalizeChain = Promise.all(
        rowsForNormalization.map((row: any) =>
          fetch(`${SUPABASE_URL}/functions/v1/normalize-document`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ file_id, fields: row }),
          })
        )
      ).catch(() => {/* non-blocking — normalization failures handled per-row */})
      // @ts-ignore - EdgeRuntime is a Supabase runtime global
      if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(normalizeChain)
    }

    if (!normalizeResponse.ok) {
      // normalize-document handles its own failure state in document_fields
      // process-document still returns success — Gemini extraction completed
      const errText = await normalizeResponse.text()
      logError(FN, "normalize_nonfatal", new Error(errText), { file_id, job_id })
    }

    // Single-row files complete here. Multi-row CSV jobs remain processing until
    // the last normalize-document invocation clears the final raw row.
    if (rowsForNormalization.length <= 1) {
      await supabase
        .from("processing_jobs")
        .update({ status: "completed" })
        .eq("file_id", file_id)
        .in("status", ["uploaded", "processing"])
    }

    return new Response(JSON.stringify({ success: true, file_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    logError(FN, "unhandled", error, { file_id: body?.file_id, job_id: body?.job_id })

    // Mark job as failed
    try {
      if (body?.file_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        await supabase
          .from("processing_jobs")
          .update({ status: "failed", error_message: error.message })
          .eq("file_id", body.file_id)
          .in("status", ["uploaded", "processing"])
      }
    } catch {}

    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
