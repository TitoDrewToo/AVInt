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

CRITICAL FORMATTING RULES:
1. Return ONLY a single JSON object — starting with { and ending with }
2. NEVER return a JSON array at the top level (never start your response with [)
3. No markdown, no code blocks, no explanation — just the JSON object
4. If the document has multiple line items, put them inside the "line_items" array field

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
    }
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

  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
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
  })

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

    // 4. Convert to base64 (chunked to avoid call stack overflow on large files)
    const arrayBuffer = await fileData.arrayBuffer()
    let uint8Array = new Uint8Array(arrayBuffer)
    let sourceRows: any[] | null = null

    // 4b. Spreadsheet → CSV conversion.
    // XLSX files are ZIP binaries Gemini cannot read directly. Convert to CSV
    // text using SheetJS, then feed as text/csv inline_data. Downstream multi-row
    // array handler already covers CSV exports.
    let mimeType = file.file_type || "application/pdf"
    const isXlsx = mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
                   /\.xlsx$/i.test(file.filename ?? "")
    if (isXlsx) {
      try {
        const XLSX = await import("https://esm.sh/xlsx@0.18.5")
        const wb = XLSX.read(uint8Array, { type: "array" })
        const csvChunks: string[] = []
        const capturedSourceRows: any[] = []
        for (const name of wb.SheetNames) {
          const sheet = wb.Sheets[name]
          const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: null })
          jsonRows.forEach((source_row: any, rowIndex: number) => {
            capturedSourceRows.push({
              sheet_name: name,
              row_index: rowIndex + 2,
              source_row,
            })
          })
          const csv = XLSX.utils.sheet_to_csv(sheet)
          if (csv.trim().length > 0) {
            csvChunks.push(`# Sheet: ${name}\n${csv}`)
          }
        }
        const joined = csvChunks.join("\n\n")
        uint8Array = new TextEncoder().encode(joined)
        mimeType = "text/csv"
        sourceRows = capturedSourceRows
        await supabase
          .from("files")
          .update({ source_rows_json: sourceRows })
          .eq("id", file_id)
        logEvent(FN, "xlsx_converted", { file_id, sheets: wb.SheetNames.length, bytes: uint8Array.length })
      } catch (e: any) {
        throw new Error(`xlsx conversion failed: ${e.message}`)
      }
    }

    let binary = ""
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)

    // 6. Call document extraction provider chain.
    const { rawText, provider: extractionProvider } = await callExtractionWithFallback(mimeType, base64, uint8Array)

    // 7. Parse extraction JSON output
    // Providers sometimes wrap output in ```json ... ``` blocks — strip those first.
    // Top-level array = CSV export (multiple document rows). Top-level object = single document.
    // IMPORTANT: use startsWith('[') to detect top-level arrays — NOT a regex search,
    // because a valid document object like {"line_items": [...]} also contains '['.
    let extractedRows: any[]
    try {
      // Strip markdown code fences if present
      const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()

      if (stripped.startsWith("[")) {
        // Top-level array — treat as multi-row CSV export
        const parsed = JSON.parse(stripped)
        extractedRows = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        // Single JSON object — standard document
        const objectMatch = stripped.match(/\{[\s\S]*\}/)
        if (!objectMatch) throw new Error("No JSON object found in response")
        extractedRows = [JSON.parse(objectMatch[0])]
      }
    } catch {
      throw new Error(`Failed to parse extraction output: ${rawText}`)
    }

    const extracted = extractedRows[0]
    const isCsv = extractedRows.length > 1

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
    const rowsToInsert = extractedRows.map((row: any, index: number) => ({
      file_id,
      vendor_name:          row.vendor_name      ?? null,
      employer_name:        row.employer_name    ?? null,
      document_date:        row.document_date    ?? null,
      currency:             row.currency         ?? null,
      total_amount:         row.total_amount     ?? null,
      gross_income:         row.gross_income     ?? null,
      net_income:           row.net_income       ?? null,
      expense_category:     row.expense_category ?? null,
      confidence_score:     row.confidence       ?? null,
      // gemini_raw is the legacy compatibility key consumed by normalization prompts.
      raw_json:             {
        gemini_raw: row,
        extraction_provider: extractionProvider,
        source_index: sourceRows?.[index] ? index : null,
        source_row: sourceRows?.[index] ?? null,
      },
      normalization_status: "raw",
    }))

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
