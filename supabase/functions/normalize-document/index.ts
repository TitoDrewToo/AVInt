import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY         = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth",
}

// ── OpenAI system prompt ──────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a financial document normalization AI.

You receive:
- A set of fields already extracted from a document by Gemini OCR
- The full raw_json output from Gemini, which may contain additional context

Your job is to return a single clean JSON object with ALL of the following fields.
Return ONLY valid JSON. No markdown, no code blocks, no explanation.

Fields to return:
{
  "vendor_name":        string or null  — clean company name, remove store/branch numbers, title case
  "employer_name":      string or null  — clean employer name, title case
  "document_date":      string or null  — ISO date YYYY-MM-DD, infer from context if needed
  "currency":           string or null  — ISO 4217 code: USD, PHP, SGD, EUR, GBP, etc
  "total_amount":       number or null  — final total paid/charged, must be a number not string
  "gross_income":       number or null  — gross pay before deductions
  "net_income":         number or null  — take-home pay after deductions
  "tax_amount":         number or null  — VAT, withholding tax, or any tax line extracted
  "discount_amount":    number or null  — any discount or promo deducted
  "expense_category":   string or null  — one of: Food, Transport, Utilities, Healthcare, Entertainment, Shopping, Travel, Office, Salary, Tax, Legal, Other
  "invoice_number":     string or null  — invoice/receipt/reference number
  "payment_method":     string or null  — Cash, Credit Card, Debit Card, Bank Transfer, GCash, PayMaya, Check, Other
  "period_start":       string or null  — pay period start date YYYY-MM-DD (payslips/statements)
  "period_end":         string or null  — pay period end date YYYY-MM-DD (payslips/statements)
  "counterparty_name":  string or null  — other named party in contracts/agreements
  "line_items":         array or null   — [{"description": string, "amount": number, "quantity": number or null}]
  "confidence_score":   number          — your confidence 0.0–1.0 in the overall extraction
}

Rules:
- Prefer values inferred from raw_json over the pre-extracted fields if raw_json has more detail
- All amount fields must be numbers, never strings
- If a field truly cannot be determined, return null — do not guess
- Normalize inconsistent casing, remove trailing punctuation from names
- For Philippine documents: PHP currency, common vendors include Jollibee, SM, Grab, etc.`

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  let body: any = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { file_id, job_id } = body

  try {
    // 1. Get the raw document_fields row
    const { data: fields, error: fieldsError } = await supabase
      .from("document_fields")
      .select("*")
      .eq("file_id", file_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (fieldsError || !fields) throw new Error("document_fields not found")

    // 2. Build input for OpenAI — send both extracted fields AND full raw_json
    //    so OpenAI can pull additional context Gemini surfaced but didn't map
    const userInput = {
      // Already-extracted fields (Gemini's output, may be partial)
      extracted: {
        vendor_name:      fields.vendor_name,
        employer_name:    fields.employer_name,
        document_date:    fields.document_date,
        currency:         fields.currency,
        total_amount:     fields.total_amount,
        gross_income:     fields.gross_income,
        net_income:       fields.net_income,
        expense_category: fields.expense_category,
        confidence_score: fields.confidence_score,
      },
      // Full raw Gemini output — OpenAI uses this to find additional fields
      raw_json: fields.raw_json,
    }

    // 3. Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: JSON.stringify(userInput) },
        ],
        max_tokens: 1024,
      }),
    })

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text()
      throw new Error(`OpenAI API error: ${err}`)
    }

    const openaiData = await openaiResponse.json()
    const rawText = openaiData.choices?.[0]?.message?.content
    if (!rawText) throw new Error("No response from OpenAI")

    let normalized: any
    try {
      normalized = JSON.parse(rawText.replace(/```json|```/g, "").trim())
    } catch {
      throw new Error(`Failed to parse OpenAI output: ${rawText}`)
    }

    // 4. Update document_fields with all normalized + enriched values
    //    Fall back to original Gemini values if OpenAI returns null for a field
    //    that was already populated — never overwrite good data with null
    const now = new Date().toISOString()

    await supabase
      .from("document_fields")
      .update({
        // Core fields
        vendor_name:       normalized.vendor_name       ?? fields.vendor_name,
        employer_name:     normalized.employer_name     ?? fields.employer_name,
        document_date:     normalized.document_date     ?? fields.document_date,
        currency:          normalized.currency          ?? fields.currency,
        total_amount:      normalized.total_amount      ?? fields.total_amount,
        gross_income:      normalized.gross_income      ?? fields.gross_income,
        net_income:        normalized.net_income        ?? fields.net_income,
        expense_category:  normalized.expense_category  ?? fields.expense_category,
        confidence_score:  normalized.confidence_score  ?? fields.confidence_score,
        // New enrichment fields
        tax_amount:        normalized.tax_amount        ?? null,
        discount_amount:   normalized.discount_amount   ?? null,
        invoice_number:    normalized.invoice_number    ?? null,
        payment_method:    normalized.payment_method    ?? null,
        period_start:      normalized.period_start      ?? null,
        period_end:        normalized.period_end        ?? null,
        counterparty_name: normalized.counterparty_name ?? null,
        line_items:        normalized.line_items        ?? fields.raw_json?.line_items ?? null,
        // Pipeline state
        normalization_status: "normalized",
        normalized_at:        now,
        normalization_error:  null,
      })
      .eq("id", fields.id)

    // 5. Mark job completed
    if (job_id) {
      await supabase
        .from("processing_jobs")
        .update({ status: "completed", completed_at: now })
        .eq("id", job_id)
    }

    return new Response(JSON.stringify({ success: true, file_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("normalize-document error:", error.message)

    // Mark normalization as failed — does NOT fail the job entirely
    // (Gemini extraction succeeded; normalization is a separate concern)
    try {
      await supabase
        .from("document_fields")
        .update({
          normalization_status: "failed",
          normalization_error:  error.message,
        })
        .eq("file_id", file_id)

      // Mark job completed anyway — file was processed, normalization is best-effort
      if (job_id) {
        await supabase
          .from("processing_jobs")
          .update({
            status:       "completed",
            completed_at: new Date().toISOString(),
            error_message: `Normalization failed: ${error.message}`,
          })
          .eq("id", job_id)
      }
    } catch (innerErr: any) {
      console.error("Failed to update failure state:", innerErr.message)
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
