import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { logError, logEvent } from "../_shared/log.ts"

const FN = "normalize-document"

const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const NORMALIZATION_PROVIDERS   = providerChain("NORMALIZATION", "openai", "anthropic")

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.avintph.com,https://avintph.com").split(",").map(s => s.trim())
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? ""
  const allow = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-auth",
    "Vary": "Origin",
  }
}

// ── OpenAI system prompt ──────────────────────────────────────────────────────
// Version bumped when this prompt changes. Rows stamped with a lower
// normalization_version can be lazily re-normalized by scripts/renormalize.ts.
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
  "vendor_normalized":      string or null  — canonical form of vendor_name suitable for grouping (e.g. "STARBUCKS #1234 SEATTLE" → "Starbucks"). Strip location suffixes, store numbers, legal suffixes (Inc, LLC, Ltd) unless they disambiguate. Use for duplicate detection.
  "employer_name":          string or null  — clean employer name, title case
  "document_date":          string or null  — ISO date YYYY-MM-DD, infer from context if needed
  "currency":               string or null  — ISO 4217 code: USD, PHP, SGD, EUR, GBP, etc
  "jurisdiction":           string or null  — best-effort ISO-like region tag: "US", "US-CA", "GB", "PH", "SG", "AU", etc. Use currency, address, tax labels (VAT/GST/Sales Tax), and language cues.
  "total_amount":           number or null  — final total paid/charged, must be a number not string
  "gross_income":           number or null  — gross pay before deductions
  "net_income":             number or null  — take-home pay after deductions
  "tax_amount":             number or null  — VAT, withholding tax, or any tax line extracted
  "discount_amount":        number or null  — any discount or promo deducted
  "expense_category":       string or null  — Schedule-C-aligned vocabulary. Pick the most specific match. Allowed values:
      Marketing, Advertising, Design, Printing,                          (→ Line 8  Advertising)
      Fuel, Parking, Transport, Tolls, Vehicle Maintenance,              (→ Line 9  Car & Truck)
      Commissions, Sales Commissions,                                    (→ Line 10 Commissions & Fees)
      Consulting, Contract Labor, Freelance,                             (→ Line 11 Contract Labor)
      Equipment, Hardware, Computer,                                     (→ Line 13 Depreciation / §179)
      Insurance,                                                         (→ Line 15)
      Loan Interest, Business Interest, Credit Card Interest,            (→ Line 16b Interest Other)
      Legal, Accounting, Professional Services,                          (→ Line 17 Legal & Professional)
      Office, Office Supplies,                                           (→ Line 18 Office Expense)
      Vehicle Rental, Equipment Rental, Machinery Rental,                (→ Line 20a Rent Vehicles/Equipment)
      Rent, Coworking, Office Rent,                                      (→ Line 20b Rent Other Property)
      Repairs, Maintenance,                                              (→ Line 21)
      Subscriptions, SaaS, Cloud Services, Software,                     (→ Line 22 Supplies)
      Tax, Taxes, Business License, Permit,                              (→ Line 23 Taxes & Licenses)
      Travel, Accommodation, Airfare, Lodging,                           (→ Line 24a Travel)
      Meals, Business Meals, Client Meals,                               (→ Line 24b Meals, 50% deductible)
      Utilities, Internet, Phone, Electricity,                           (→ Line 25 Utilities)
      Wages, Employee Wages, Payroll,                                    (→ Line 26 Wages)
      Training, Education, Conferences, Bank Fees, Dues,                 (→ Line 27b Other Expenses)
      Home Office,                                                       (→ Line 30)
      Other
      NOTE: Entertainment is NOT deductible post-TCJA (2018+). Do not use "Entertainment" — only "Meals" when clearly a meal.
  "income_source":          string or null  — REQUIRED for any income document. One of:
      "business"   → self-employment / freelance / business revenue → Schedule C base
      "wage"       → W-2 / payslip / salary from an employer
      "investment" → brokerage statements, dividends, capital gains, 1099-DIV, 1099-B
      "rental"     → rental property income
      "interest"   → interest income, 1099-INT, savings account statements
      "other"      → anything else (alimony, gifts, refunds treated as income, etc.)
      Return null for pure expense documents (receipts, invoices) and contracts.
  "classification_rationale": string or null — one short sentence explaining how you chose expense_category and income_source. Cited evidence beats speculation. Used for audit and user trust.
  "invoice_number":         string or null  — invoice/receipt/reference number
  "payment_method":         string or null  — Cash, Credit Card, Debit Card, Bank Transfer, GCash, PayMaya, Check, Other
  "period_start":           string or null  — period the document COVERS (YYYY-MM-DD). For a payslip this is the pay period start. For a receipt this is the transaction date (same as document_date). For an income statement this is the fiscal period start.
  "period_end":             string or null  — period end date (YYYY-MM-DD). Same semantics as period_start. If unknown, fall back to document_date.
  "counterparty_name":      string or null  — other named party in contracts/agreements
  "merchant_domain":        string or null  — classify the merchant (not the expense category) into exactly one of:
      "food_service"          — restaurants, cafes, bars, fast food
      "grocery"               — supermarkets, convenience stores, food markets
      "fuel"                  — gas stations, petrol stations
      "transit"               — ride-share (Grab, Uber, Lyft), taxi, public transit, parking, tolls
      "travel"                — airlines, hotels, lodging, car rental, travel agencies
      "retail"                — department stores, apparel, general retail, e-commerce
      "software_saas"         — SaaS, cloud services, app subscriptions, developer tools
      "telecom"               — phone, internet, mobile carriers
      "utilities"              — electricity, water, gas (utility), sewage
      "professional_services" — legal, accounting, consulting, freelance, contractors
      "healthcare"            — medical, pharmacy, clinics, hospitals, insurance claims
      "financial_services"    — banks, credit cards, insurance premiums, bank/card fees
      "government"            — taxes paid, permits, licenses, fines, BIR/SSS/PhilHealth
      "education"             — training, courses, conferences, dues, tuition
      "entertainment"         — streaming, events, media, theaters (note: non-deductible post-TCJA)
      "home_office"           — home-office-specific spend (rent portion, furniture for WFH)
      "other"                 — anything that doesn't clearly fit above
      merchant_domain is ABOUT THE MERCHANT, not the Schedule C line. A Starbucks receipt is "food_service"
      even though it may be booked to "Meals". Return null only for income/contract docs with no merchant party.
  "merchant_address_city":    string or null — city from the merchant's address, title case (e.g., "Makati", "Seattle")
  "merchant_address_region":  string or null — state/province/region from the merchant's address (e.g., "CA", "Metro Manila", "NCR")
  "merchant_address_country": string or null — ISO-3166-1 alpha-2 country code from merchant's address ("US", "PH", "SG")
  "is_recurring":           boolean         — true if this document represents a recurring charge (subscription, monthly bill,
      auto-pay utility, SaaS billing cycle). Evidence: "subscription", "monthly plan", "recurring", "auto-renewal" in raw_json,
      OR explicit period_start/period_end spanning a typical billing cycle for a known recurring-domain merchant
      (software_saas, telecom, utilities, streaming/entertainment). Default to false when evidence is ambiguous — false is safe.
  "recurrence_cadence":     string or null — when is_recurring is true, the cadence: "weekly", "biweekly", "monthly",
      "quarterly", "annual", or "irregular". Null when is_recurring is false or cadence is unknown.
  "line_items":             array or null   — preserve all entries from Gemini exactly. For contracts/agreements each entry may contain: {"description": string, "amount": number, "quantity": number or null, "unit_quantity": number or null, "due_date": "YYYY-MM-DD or null", "check_number": "string or null", "bank_name": "string or null"}. For receipts/invoices the standard {"description", "amount", "quantity", "unit_quantity"} format is used. unit_quantity captures the explicit unit count when distinct from quantity (e.g., a receipt line "2 x 500ml bottles" → quantity: 2, unit_quantity: 500; a receipt line "3 items" → quantity: 3, unit_quantity: null). Never discard or flatten entries.
  "confidence_score":       number          — your confidence 0.0–1.0 in the overall extraction
}

Rules:
- Prefer values inferred from raw_json over the pre-extracted fields if raw_json has more detail
- All amount fields must be numbers, never strings
- If a field truly cannot be determined, return null — do not guess
- Normalize inconsistent casing, remove trailing punctuation from names
- period_start and period_end MUST always be populated when the document has any
  temporal meaning — use document_date as the fallback when no explicit range exists,
  so downstream period-overlap queries work uniformly.
- income_source is the single source of truth for how a document's income is treated
  downstream. If in doubt between business and investment, cite the strongest signal
  in classification_rationale and pick the most likely.
- For Philippine documents: PHP currency, jurisdiction "PH", common vendors include Jollibee, SM, Grab, etc.
- For contracts/agreements: if raw_json contains a payment schedule table (PDC or installment entries with due_date fields), ensure all entries are preserved in line_items — do not summarize or drop rows.
- merchant_domain vs expense_category: these are orthogonal. merchant_domain describes WHAT KIND OF MERCHANT issued the document; expense_category describes WHICH SCHEDULE C LINE it maps to. A Grab ride receipt → merchant_domain "transit", expense_category "Transport". An Uber Eats receipt → merchant_domain "food_service", expense_category "Meals". Fill both independently.
- merchant address fields: extract from the merchant's printed address on the document (not the customer's billing address). If only a branch name hints at a city ("SM Makati", "Starbucks Bonifacio Global City"), populate merchant_address_city with the inferred city. Always return ISO-3166-1 alpha-2 for merchant_address_country.
- is_recurring: be conservative. A one-off receipt at a SaaS vendor is not recurring just because the vendor is in a recurring domain — require explicit recurrence evidence (invoice text, subscription language, period spanning a known billing cycle). Payslips are NOT recurring for this field — they are periodic income, not a recurring expense.
- unit_quantity inside line_items: return it only when the document clearly states a per-unit measure distinct from line quantity (e.g., "2 x 500ml", "5kg rice", "12 pack"). Do NOT invent unit_quantity when the line is just "3 items" or "1 service".`

// ── Main handler ──────────────────────────────────────────────────────────────
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
  const { file_id, job_id, fields: inlineFields } = body

  // Hoisted so the catch block can target the specific row (by id) when it's
  // known, and increment normalization_attempts against that row.
  let fields: any

  try {
    // 1. Use inline fields if provided (from reprocess-documents), otherwise query DB
    if (inlineFields) {
      fields = inlineFields
    } else {
      const { data: fieldsArr, error: fieldsError } = await supabase
        .from("document_fields")
        .select("*")
        .eq("file_id", file_id)
        .order("created_at", { ascending: false })
        .limit(1)

      if (fieldsError) throw new Error(`document_fields query error: ${fieldsError.message}`)
      if (!fieldsArr?.length) throw new Error("document_fields not found for file_id: " + file_id)
      fields = fieldsArr[0]
    }

    // Retry ceiling. Skip rows that have repeatedly failed normalization to
    // avoid burning provider tokens on unreparable inputs. Success resets the
    // counter, so legitimate version-upgrade re-runs aren't blocked.
    const priorAttempts = fields.normalization_attempts ?? 0
    if (priorAttempts >= 3 && fields.normalization_status === "failed") {
      logEvent(FN, "retry_ceiling_skip", { file_id, attempts: priorAttempts })
      if (job_id) {
        await supabase
          .from("processing_jobs")
          .update({
            status:        "completed",
            completed_at:  new Date().toISOString(),
            error_message: `Skipped: normalization retry ceiling reached (${priorAttempts} attempts)`,
          })
          .eq("id", job_id)
      }
      return new Response(
        JSON.stringify({ skipped: true, reason: "retry_ceiling", attempts: priorAttempts, file_id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // 2. Build input for normalization — send both extracted fields AND full raw_json
    //    so the selected provider can pull context extraction surfaced but didn't map.
    const userInput = {
      // Already-extracted fields from process-document, may be partial.
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
      // Full extraction output — normalization uses this to find additional fields.
      raw_json: fields.raw_json,
    }

    // 3. Call AI provider
    const callProvider = async (provider: AiProvider): Promise<string> => {
      if (provider === "anthropic") {
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
            system: SYSTEM_PROMPT + "\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown, no code blocks.",
            messages: [{ role: "user", content: JSON.stringify(userInput) }],
          }),
        })
        if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`)
        const data = await res.json()
        return data.content?.[0]?.text ?? ""
      }
      if (provider === "openai") {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
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
        if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
        const data = await res.json()
        return data.choices?.[0]?.message?.content ?? ""
      }
      throw new Error(`Unsupported normalization provider: ${provider}`)
    }

    let rawText = ""
    let normalizationProvider: AiProvider | null = null
    let lastProviderError: unknown = null
    for (const provider of NORMALIZATION_PROVIDERS) {
      try {
        rawText = await callProvider(provider)
        if (!rawText) throw new Error(`Empty response from ${provider}`)
        normalizationProvider = provider
        break
      } catch (error) {
        lastProviderError = error
        logError(FN, "provider_failed", error, { provider, file_id })
        if (!isProviderFailure(error)) break
      }
    }
    if (!rawText && lastProviderError instanceof Error) throw lastProviderError
    if (!rawText) throw new Error("No response from AI")

    let normalized: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON object found in response")
      normalized = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error(`Failed to parse AI output: ${rawText}`)
    }

    // 4. Update document_fields with all normalized + enriched values
    //    Fall back to original extraction values if normalization returns null for a field
    //    that was already populated — never overwrite good data with null
    const now = new Date().toISOString()

    // Fall back period_start / period_end to document_date so every row has a
    // usable temporal range for period-overlap queries.
    const effectiveDocDate = normalized.document_date ?? fields.document_date ?? null
    const effectivePeriodStart = normalized.period_start ?? effectiveDocDate
    const effectivePeriodEnd   = normalized.period_end   ?? effectiveDocDate

    await supabase
      .from("document_fields")
      .update({
        // Core fields
        vendor_name:              normalized.vendor_name              ?? fields.vendor_name,
        vendor_normalized:        normalized.vendor_normalized        ?? null,
        employer_name:            normalized.employer_name            ?? fields.employer_name,
        document_date:            normalized.document_date            ?? fields.document_date,
        currency:                 normalized.currency                 ?? fields.currency,
        jurisdiction:             normalized.jurisdiction             ?? null,
        total_amount:             normalized.total_amount             ?? fields.total_amount,
        gross_income:             normalized.gross_income             ?? fields.gross_income,
        net_income:               normalized.net_income               ?? fields.net_income,
        expense_category:         normalized.expense_category         ?? fields.expense_category,
        income_source:            normalized.income_source            ?? null,
        classification_rationale: normalized.classification_rationale ?? null,
        confidence_score:         normalized.confidence_score         ?? fields.confidence_score,
        // Enrichment fields (v1)
        tax_amount:               normalized.tax_amount               ?? null,
        discount_amount:          normalized.discount_amount          ?? null,
        invoice_number:           normalized.invoice_number           ?? null,
        payment_method:           normalized.payment_method           ?? null,
        period_start:             effectivePeriodStart,
        period_end:               effectivePeriodEnd,
        counterparty_name:        normalized.counterparty_name        ?? null,
        // Merchant enrichment (v3) — powers spending-first analytics families
        merchant_domain:          normalized.merchant_domain          ?? null,
        merchant_address_city:    normalized.merchant_address_city    ?? null,
        merchant_address_region:  normalized.merchant_address_region  ?? null,
        merchant_address_country: normalized.merchant_address_country ?? null,
        is_recurring:             normalized.is_recurring === true,
        recurrence_cadence:       normalized.is_recurring === true ? (normalized.recurrence_cadence ?? null) : null,
        line_items:               normalized.line_items               ?? fields.raw_json?.line_items ?? null,
        // Preserve full AI outputs in raw_json.
        raw_json: {
          ...(fields.raw_json ?? {}),
          normalization_enriched: normalized,
          normalization_provider: normalizationProvider,
          ...(normalizationProvider === "openai" ? { openai_enriched: normalized } : {}),
        },
        // Pipeline state
        normalization_status:   "normalized",
        normalization_version:  NORMALIZATION_VERSION,
        normalized_at:          now,
        normalization_error:    null,
        normalization_attempts: 0,
      })
      .eq("id", fields.id)

    // 5. Auto-create payment_obligations for contract/agreement docs with PDC/payment schedules
    try {
      const { data: fileRow } = await supabase
        .from("files")
        .select("user_id, document_type")
        .eq("id", file_id)
        .single()

      const isContract = fileRow?.document_type === "contract" || fileRow?.document_type === "agreement"
      const lineItems: any[] | null = normalized.line_items ?? fields.raw_json?.line_items ?? null

      if (isContract && fileRow?.user_id && Array.isArray(lineItems)) {
        const obligations = lineItems
          .filter((item: any) => item?.due_date)
          .map((item: any) => ({
            user_id:           fileRow.user_id,
            file_id:           file_id,
            counterparty_name: normalized.counterparty_name ?? fields.counterparty_name ?? null,
            description:       item.description ?? null,
            amount:            typeof item.amount === "number" ? item.amount : null,
            currency:          normalized.currency ?? fields.currency ?? "PHP",
            due_date:          item.due_date,
            check_number:      item.check_number ?? null,
            bank_name:         item.bank_name ?? null,
            status:            "pending",
          }))

        if (obligations.length > 0) {
          // Pre-filter to avoid hitting the unique index — supabase-js cannot
          // reference expression-based indexes by name in onConflict
          const { data: existing } = await supabase
            .from("payment_obligations")
            .select("due_date, check_number")
            .eq("file_id", file_id)

          const existingKeys = new Set(
            (existing ?? []).map((r: any) => `${r.due_date}|${r.check_number ?? ""}`)
          )

          const toInsert = obligations.filter((o: any) =>
            !existingKeys.has(`${o.due_date}|${o.check_number ?? ""}`)
          )

          if (toInsert.length > 0) {
            const { error: oblErr } = await supabase
              .from("payment_obligations")
              .insert(toInsert)
            if (oblErr) logError(FN, "obligations_insert", oblErr, { file_id })
            else logEvent(FN, "obligations_created", { file_id, count: toInsert.length })
          }
        }
      }
    } catch (oblErr: any) {
      // Non-fatal — normalization succeeded; don't fail the job over this
      logError(FN, "obligations_step", oblErr, { file_id })
    }

    // 6. Mark job completed
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
    logError(FN, "unhandled", error, { file_id, job_id })

    // Mark normalization as failed — does NOT fail the job entirely
    // (Gemini extraction succeeded; normalization is a separate concern)
    try {
      // When the specific row is known, target by id and bump the retry counter.
      // Early failures (before `fields` resolves) fall back to file_id — those
      // never reach the AI provider so we don't count them against the ceiling.
      if (fields?.id != null) {
        await supabase
          .from("document_fields")
          .update({
            normalization_status:   "failed",
            normalization_error:    error.message,
            normalization_attempts: (fields.normalization_attempts ?? 0) + 1,
          })
          .eq("id", fields.id)
      } else {
        await supabase
          .from("document_fields")
          .update({
            normalization_status: "failed",
            normalization_error:  error.message,
          })
          .eq("file_id", file_id)
      }

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
      logError(FN, "failure_state_update", innerErr, { file_id, job_id })
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
