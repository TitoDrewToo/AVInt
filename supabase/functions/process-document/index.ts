import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  // Read body once and store
  let body: any = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid or empty request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  try {
    const { file_id, job_id } = body
    console.log("Full body received:", JSON.stringify(body))
    console.log("Received file_id:", file_id, "job_id:", job_id)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Mark job as processing
    await supabase
      .from("processing_jobs")
      .update({ status: "processing" })
      .eq("id", job_id)

    // 2. Get file record
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", file_id)
      .single()

    if (fileError || !file) throw new Error("File not found")

    // 3. Download file from storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from("documents")
      .download(file.storage_path)

    if (downloadError || !fileData) throw new Error("Failed to download file")

    // 4. Convert to base64 (chunked to avoid call stack overflow on large files)
    const arrayBuffer = await fileData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ""
    const chunkSize = 8192
    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      binary += String.fromCharCode(...uint8Array.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)

    // 5. Determine MIME type
    const mimeType = file.file_type || "application/pdf"

    // 6. Call Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                }
              },
              {
                text: `You are a document extraction AI. Analyze this document and extract structured data.

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
  "line_items": [{"description": "string", "amount": number}],
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
- line_items should be an empty array [] if no line items found, never null`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          }
        })
      }
    )

    if (!geminiResponse.ok) {
      const err = await geminiResponse.text()
      throw new Error(`Gemini API error: ${err}`)
    }

    const geminiData = await geminiResponse.json()
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) throw new Error("No response from Gemini")

    // 7. Parse Gemini JSON output
    // Gemini sometimes wraps output in ```json ... ``` blocks — strip those first.
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
      throw new Error(`Failed to parse Gemini output: ${rawText}`)
    }

    const extracted = extractedRows[0]
    const isCsv = extractedRows.length > 1

    // 8. Update files.document_type
    // For CSVs use the first row's type; mark as csv_export for clarity
    await supabase
      .from("files")
      .update({
        document_type: isCsv ? "csv_export" : (extracted.document_type ?? "general_document"),
        upload_status: "completed",
      })
      .eq("id", file_id)

    // 9. Insert all rows into document_fields
    const rowsToInsert = extractedRows.map((row: any) => ({
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
      raw_json:             { gemini_raw: row },
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
      Promise.all(
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
    }

    if (!normalizeResponse.ok) {
      // normalize-document handles its own failure state in document_fields
      // process-document still returns success — Gemini extraction completed
      const errText = await normalizeResponse.text()
      console.error("Normalize function failed (non-fatal):", errText)
    }

    return new Response(JSON.stringify({ success: true, file_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("process-document error:", error)

    // Mark job as failed
    try {
      if (body?.job_id) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        await supabase
          .from("processing_jobs")
          .update({ status: "failed", error_message: error.message })
          .eq("id", body.job_id)
      }
    } catch {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
