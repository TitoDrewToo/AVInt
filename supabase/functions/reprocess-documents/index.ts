import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AI_PROVIDER               = Deno.env.get("NORMALIZATION_PROVIDER") ?? Deno.env.get("AI_PROVIDER") ?? "anthropic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

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

async function callAI(systemPrompt: string, userInput: any): Promise<string> {
  if (AI_PROVIDER === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt + "\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown, no code blocks.",
        messages: [{ role: "user", content: JSON.stringify(userInput) }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ""
  } else {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: JSON.stringify(userInput) },
        ],
        max_tokens: 1024,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ""
  }
}

async function normalizeRow(supabase: any, row: any): Promise<void> {
  const userInput = {
    extracted: {
      vendor_name:      row.vendor_name,
      employer_name:    row.employer_name,
      document_date:    row.document_date,
      currency:         row.currency,
      total_amount:     row.total_amount,
      gross_income:     row.gross_income,
      net_income:       row.net_income,
      expense_category: row.expense_category,
      confidence_score: row.confidence_score,
    },
    raw_json: row.raw_json,
  }

  const rawText = await callAI(SYSTEM_PROMPT, userInput)
  if (!rawText) throw new Error("Empty response from AI")

  let normalized: any
  try {
    normalized = JSON.parse(rawText.replace(/```json|```/g, "").trim())
  } catch {
    throw new Error(`Failed to parse AI output: ${rawText}`)
  }

  const now = new Date().toISOString()

  await supabase
    .from("document_fields")
    .update({
      vendor_name:       normalized.vendor_name       ?? row.vendor_name,
      employer_name:     normalized.employer_name     ?? row.employer_name,
      document_date:     normalized.document_date     ?? row.document_date,
      currency:          normalized.currency          ?? row.currency,
      total_amount:      normalized.total_amount      ?? row.total_amount,
      gross_income:      normalized.gross_income      ?? row.gross_income,
      net_income:        normalized.net_income        ?? row.net_income,
      expense_category:  normalized.expense_category  ?? row.expense_category,
      confidence_score:  normalized.confidence_score  ?? row.confidence_score,
      tax_amount:        normalized.tax_amount        ?? null,
      discount_amount:   normalized.discount_amount   ?? null,
      invoice_number:    normalized.invoice_number    ?? null,
      payment_method:    normalized.payment_method    ?? null,
      period_start:      normalized.period_start      ?? null,
      period_end:        normalized.period_end        ?? null,
      counterparty_name: normalized.counterparty_name ?? null,
      line_items:        normalized.line_items        ?? row.raw_json?.line_items ?? null,
      normalization_status: "normalized",
      normalized_at:        now,
      normalization_error:  null,
    })
    .eq("id", row.id)
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: rawRows, error } = await supabase
    .from("document_fields")
    .select("*")
    .eq("normalization_status", "raw")

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!rawRows?.length) {
    return new Response(JSON.stringify({ message: "No raw records to process", count: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  console.log(`Reprocessing ${rawRows.length} raw document_fields records`)

  const results: { file_id: string; status: string; error?: string }[] = []

  for (const row of rawRows) {
    try {
      await normalizeRow(supabase, row)
      results.push({ file_id: row.file_id, status: "normalized" })
    } catch (err: any) {
      console.error(`Failed to normalize file_id ${row.file_id}:`, err.message)
      await supabase
        .from("document_fields")
        .update({ normalization_status: "failed", normalization_error: err.message })
        .eq("id", row.id)
      results.push({ file_id: row.file_id, status: "failed", error: err.message })
    }
  }

  const succeeded = results.filter((r) => r.status === "normalized").length
  const failed    = results.filter((r) => r.status !== "normalized").length

  console.log(`Done: ${succeeded} normalized, ${failed} failed`)

  return new Response(
    JSON.stringify({ total: rawRows.length, succeeded, failed, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})
