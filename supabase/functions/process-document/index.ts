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

Return ONLY a valid JSON object with no markdown, no code blocks, no explanation.

Extract these fields if present:
{
  "document_type": "receipt|invoice|payslip|income_statement|bank_statement|transaction_record|contract|agreement|tax_document|general_document",
  "vendor_name": "string or null",
  "employer_name": "string or null",
  "document_date": "YYYY-MM-DD or null",
  "currency": "USD|PHP|SGD|etc or null",
  "total_amount": number or null,
  "gross_income": number or null,
  "net_income": number or null,
  "expense_category": "Food|Transport|Utilities|Healthcare|Entertainment|Shopping|Travel|Office|Other or null",
  "line_items": [{"description": "string", "amount": number}] or [],
  "confidence": number between 0 and 1
}

Rules:
- document_type must be one of the exact values listed
- dates must be ISO format YYYY-MM-DD
- amounts must be numbers not strings
- confidence reflects how certain you are about the extraction
- if a field cannot be determined return null`
              }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
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
    // Gemini sometimes wraps output in ```json ... ``` — extract object or array
    // For CSVs Gemini may return an array of rows — take the first element
    let extracted: any
    try {
      const arrayMatch = rawText.match(/\[[\s\S]*\]/)
      const objectMatch = rawText.match(/\{[\s\S]*\}/)
      if (arrayMatch) {
        const parsed = JSON.parse(arrayMatch[0])
        extracted = Array.isArray(parsed) ? parsed[0] : parsed
      } else if (objectMatch) {
        extracted = JSON.parse(objectMatch[0])
      } else {
        throw new Error("No JSON found in response")
      }
    } catch {
      throw new Error(`Failed to parse Gemini output: ${rawText}`)
    }

    // 8. Update files.document_type
    await supabase
      .from("files")
      .update({
        document_type: extracted.document_type ?? "general_document",
        upload_status: "completed",
      })
      .eq("id", file_id)

    // 9. Insert into document_fields — normalization_status starts as 'raw'
    //    normalize-document function will update it to 'normalized' or 'failed'
    await supabase
      .from("document_fields")
      .insert({
        file_id,
        vendor_name:          extracted.vendor_name      ?? null,
        employer_name:        extracted.employer_name    ?? null,
        document_date:        extracted.document_date    ?? null,
        currency:             extracted.currency         ?? null,
        total_amount:         extracted.total_amount     ?? null,
        gross_income:         extracted.gross_income     ?? null,
        net_income:           extracted.net_income       ?? null,
        expense_category:     extracted.expense_category ?? null,
        confidence_score:     extracted.confidence       ?? null,
        raw_json:             extracted,
        normalization_status: "raw",
      })

    // 10. Call normalize-document function
    const normalizeResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/normalize-document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ file_id, job_id }),
      }
    )

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
