import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AI_PROVIDER               = Deno.env.get("NORMALIZATION_PROVIDER") ?? Deno.env.get("AI_PROVIDER") ?? "anthropic"

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

// Must stay in lock-step with supabase/functions/normalize-document/index.ts.
// When the primary prompt changes, mirror it here and bump NORMALIZATION_VERSION
// so downstream version-gated flows can distinguish freshly re-normalized rows.
const NORMALIZATION_VERSION = 3

const SYSTEM_PROMPT = `You are a financial document normalization AI.

You receive:
- A set of fields already extracted from a document by Gemini OCR
- The full raw_json output from Gemini, which may contain additional context

Your job is to return a single clean JSON object with ALL of the following fields.
Return ONLY valid JSON. No markdown, no code blocks, no explanation.

Fields to return:
{
  "vendor_name":            string or null  — clean company name, remove store/branch numbers, title case
  "vendor_normalized":      string or null  — canonical form of vendor_name suitable for grouping (e.g. "STARBUCKS #1234 SEATTLE" → "Starbucks"). Strip location suffixes, store numbers, legal suffixes (Inc, LLC, Ltd) unless they disambiguate.
  "employer_name":          string or null  — clean employer name, title case
  "document_date":          string or null  — ISO date YYYY-MM-DD, infer from context if needed
  "currency":               string or null  — ISO 4217 code: USD, PHP, SGD, EUR, GBP, etc
  "jurisdiction":           string or null  — best-effort ISO-like region tag: "US", "US-CA", "GB", "PH", "SG", "AU", etc.
  "total_amount":           number or null  — final total paid/charged, must be a number not string
  "gross_income":           number or null  — gross pay before deductions
  "net_income":             number or null  — take-home pay after deductions
  "tax_amount":             number or null  — VAT, withholding tax, or any tax line extracted
  "discount_amount":        number or null  — any discount or promo deducted
  "expense_category":       string or null  — Schedule-C-aligned vocabulary (see normalize-document prompt for full list). Examples: "Marketing", "Fuel", "Subscriptions", "Meals", "Utilities". Post-TCJA: no "Entertainment" — only "Meals" when clearly a meal.
  "income_source":          string or null  — "business" | "wage" | "investment" | "rental" | "interest" | "other". Return null for pure expense documents (receipts, invoices) and contracts.
  "classification_rationale": string or null — one short sentence explaining how you chose expense_category and income_source.
  "invoice_number":         string or null  — invoice/receipt/reference number
  "payment_method":         string or null  — Cash, Credit Card, Debit Card, Bank Transfer, GCash, PayMaya, Check, Other
  "period_start":           string or null  — period the document COVERS (YYYY-MM-DD). Fall back to document_date when no explicit range exists.
  "period_end":             string or null  — period end date (YYYY-MM-DD). Fall back to document_date when no explicit range exists.
  "counterparty_name":      string or null  — other named party in contracts/agreements
  "merchant_domain":        string or null  — one of: "food_service" | "grocery" | "fuel" | "transit" | "travel" | "retail" | "software_saas" | "telecom" | "utilities" | "professional_services" | "healthcare" | "financial_services" | "government" | "education" | "entertainment" | "home_office" | "other". Describes the merchant, not the Schedule C line. A Starbucks receipt → "food_service" even if booked to Meals.
  "merchant_address_city":    string or null — city from the merchant's address, title case
  "merchant_address_region":  string or null — state/province/region from the merchant's address
  "merchant_address_country": string or null — ISO-3166-1 alpha-2 country code from merchant's address
  "is_recurring":           boolean         — true only when there is explicit recurrence evidence (subscription/auto-renewal/billing-cycle language). Default false when ambiguous. Payslips are NOT recurring.
  "recurrence_cadence":     string or null — when is_recurring is true: "weekly" | "biweekly" | "monthly" | "quarterly" | "annual" | "irregular". Null otherwise.
  "line_items":             array or null   — preserve all entries from raw_json exactly. Item shape: {"description", "amount", "quantity", "unit_quantity", "due_date", "check_number", "bank_name"}. unit_quantity captures explicit per-unit measure ("2 x 500ml" → quantity 2, unit_quantity 500). Never discard or flatten entries.
  "confidence_score":       number          — your confidence 0.0–1.0 in the overall extraction
}

Rules:
- Prefer values inferred from raw_json over the pre-extracted fields if raw_json has more detail
- All amount fields must be numbers, never strings
- If a field truly cannot be determined, return null — do not guess
- period_start / period_end MUST always be populated when the document has any temporal meaning — fall back to document_date
- For Philippine documents: PHP currency, jurisdiction "PH", common vendors include Jollibee, SM, Grab, etc.
- For contracts/agreements: preserve all payment-schedule entries in line_items — do not summarize or drop rows.
- merchant_domain vs expense_category are orthogonal (merchant identity vs Schedule C line).
- is_recurring: be conservative — require explicit recurrence evidence.`

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

  const effectiveDocDate = normalized.document_date ?? row.document_date ?? null
  const effectivePeriodStart = normalized.period_start ?? effectiveDocDate
  const effectivePeriodEnd   = normalized.period_end   ?? effectiveDocDate

  await supabase
    .from("document_fields")
    .update({
      // Core
      vendor_name:              normalized.vendor_name              ?? row.vendor_name,
      vendor_normalized:        normalized.vendor_normalized        ?? row.vendor_normalized ?? null,
      employer_name:            normalized.employer_name            ?? row.employer_name,
      document_date:            normalized.document_date            ?? row.document_date,
      currency:                 normalized.currency                 ?? row.currency,
      jurisdiction:             normalized.jurisdiction             ?? row.jurisdiction ?? null,
      total_amount:             normalized.total_amount             ?? row.total_amount,
      gross_income:             normalized.gross_income             ?? row.gross_income,
      net_income:               normalized.net_income               ?? row.net_income,
      expense_category:         normalized.expense_category         ?? row.expense_category,
      income_source:            normalized.income_source            ?? row.income_source ?? null,
      classification_rationale: normalized.classification_rationale ?? row.classification_rationale ?? null,
      confidence_score:         normalized.confidence_score         ?? row.confidence_score,
      // Enrichment (v1–v2)
      tax_amount:               normalized.tax_amount               ?? row.tax_amount ?? null,
      discount_amount:          normalized.discount_amount          ?? row.discount_amount ?? null,
      invoice_number:           normalized.invoice_number           ?? row.invoice_number ?? null,
      payment_method:           normalized.payment_method           ?? row.payment_method ?? null,
      period_start:             effectivePeriodStart,
      period_end:               effectivePeriodEnd,
      counterparty_name:        normalized.counterparty_name        ?? row.counterparty_name ?? null,
      // Merchant enrichment (v3)
      merchant_domain:          normalized.merchant_domain          ?? row.merchant_domain ?? null,
      merchant_address_city:    normalized.merchant_address_city    ?? row.merchant_address_city ?? null,
      merchant_address_region:  normalized.merchant_address_region  ?? row.merchant_address_region ?? null,
      merchant_address_country: normalized.merchant_address_country ?? row.merchant_address_country ?? null,
      is_recurring:             normalized.is_recurring === true,
      recurrence_cadence:       normalized.is_recurring === true ? (normalized.recurrence_cadence ?? null) : null,
      line_items:               normalized.line_items               ?? row.line_items ?? row.raw_json?.line_items ?? null,
      raw_json: {
        ...(row.raw_json ?? {}),
        openai_enriched: normalized,
      },
      // Pipeline state
      normalization_status:  "normalized",
      normalization_version: NORMALIZATION_VERSION,
      normalized_at:         now,
      normalization_error:   null,
    })
    .eq("id", row.id)
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (token !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Service role required" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
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
