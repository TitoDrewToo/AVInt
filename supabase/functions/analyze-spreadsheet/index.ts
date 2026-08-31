import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"
import { logError, logEvent } from "../_shared/log.ts"

const FN = "analyze-spreadsheet"

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANALYZE_PROVIDERS = providerChain("ANALYZE", "anthropic", "openai")

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

const CURRENCY_SYMBOL_TO_CODE: Record<string, string> = {
  "$": "USD",
  "₱": "PHP",
  "€": "EUR",
  "£": "GBP",
  "¥": "JPY",
}

function missingCurrency(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const text = String(value).trim()
  return !text || text.toLowerCase() === "unspecified"
}

function inferCurrencyFromRowContext(row: any): string | null {
  const sourceRow = row.raw_json?.source_row ?? null
  const cells = sourceRow?.cells ?? sourceRow?.source_row ?? {}
  const context = [
    row.vendor_name,
    row.employer_name,
    row.counterparty_name,
    row.raw_json?.source_sheet,
    ...Object.values(cells),
  ].filter((value) => value !== null && value !== undefined).join(" ")

  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOL_TO_CODE)) {
    if (context.includes(symbol)) return code
  }
  if (/\b(USD|US employer|Acme Corp|Payslips?)\b/i.test(context)) return "USD"
  if (/\b(PHP|Philippines?|BPI|PDC|Premier Properties|Lease Contract|Rent)\b/i.test(context)) return "PHP"
  if (/\bEUR\b/i.test(context)) return "EUR"
  if (/\bGBP\b/i.test(context)) return "GBP"
  if (/\bSGD\b/i.test(context)) return "SGD"
  return null
}

function buildCurrencyMissingFindings(rows: any[]) {
  const grouped: Record<string, any[]> = {}
  for (const row of rows) {
    if (!missingCurrency(row.currency)) continue
    const inferred = inferCurrencyFromRowContext(row)
    if (!inferred) continue
    ;(grouped[inferred] ??= []).push(row)
  }

  return Object.entries(grouped).map(([currency, affectedRows]) => ({
    id: `currency-missing-${currency.toLowerCase()}`,
    type: "currency_missing",
    title: `Set currency on ${affectedRows.length} row${affectedRows.length === 1 ? "" : "s"}`,
    rationale: `Row context points to ${currency}; confirm before using these rows in dashboard totals.`,
    confidence: 0.82,
    affected_row_ids: affectedRows.map((row) => row.id).slice(0, 200),
    proposed_action: { kind: "set_field", field: "currency", value: currency },
  }))
}

async function checkRateLimit(supabase: any, userId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("rate_limit_hit", {
    p_bucket: "analyze-spreadsheet",
    p_key: userId,
    p_window_seconds: 60 * 60,
    p_max_calls: 5,
  })
  if (error) {
    logError(FN, "rate_limit_fail_open", error, { user_id: userId })
    return true
  }
  return data === true
}

async function callAIProvider(provider: AiProvider, systemPrompt: string, prompt: string): Promise<string> {
  if (provider === "anthropic") {
    const res = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 16384,
          temperature: 0.1,
          system: systemPrompt,
          messages: [{ role: "user", content: prompt }],
        }),
      },
      90_000,
    )
    if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ""
  }

  if (provider === "openai") {
    const res = await fetchWithTimeout(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: 16384,
        }),
      },
      90_000,
    )
    if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ""
  }

  throw new Error(`Unsupported analysis provider: ${provider}`)
}

async function callAI(systemPrompt: string, prompt: string): Promise<{ rawText: string; provider: AiProvider }> {
  let lastError: unknown = null
  for (const provider of ANALYZE_PROVIDERS) {
    try {
      const rawText = await callAIProvider(provider, systemPrompt, prompt)
      if (!rawText) throw new Error(`Empty response from ${provider}`)
      return { rawText, provider }
    } catch (error) {
      lastError = error
      logError(FN, "provider_failed", error, { provider })
      if (!isProviderFailure(error)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All analysis providers failed")
}

function extractJsonCandidate(rawText: string): string {
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  const objectStart = stripped.indexOf("{")
  if (objectStart < 0) return stripped
  const objectEnd = stripped.lastIndexOf("}")
  return objectEnd > objectStart ? stripped.slice(objectStart, objectEnd + 1) : stripped.slice(objectStart)
}

function tryParseAnalysis(rawText: string): any {
  const candidate = extractJsonCandidate(rawText)
  try {
    return JSON.parse(candidate)
  } catch (firstErr) {
    const recovered = attemptJsonRecovery(candidate)
    if (recovered) {
      logEvent(FN, "json_recovered", { original_length: candidate.length })
      return recovered
    }
    throw firstErr
  }
}

function attemptJsonRecovery(text: string): any | null {
  const findingsArrayStart = text.indexOf('"findings"')
  if (findingsArrayStart < 0) return null
  const arrayBracketIdx = text.indexOf("[", findingsArrayStart)
  if (arrayBracketIdx < 0) return null

  let depth = 0
  let lastValidEnd = -1
  let inString = false
  let escaped = false

  for (let i = arrayBracketIdx + 1; i < text.length; i++) {
    const char = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (char === "{") depth++
    if (char === "}" && depth > 0) {
      depth--
      if (depth === 0) lastValidEnd = i
    }
  }

  if (lastValidEnd < 0) return null

  const recovered = `${text.slice(0, lastValidEnd + 1)}]}`
  try {
    return JSON.parse(recovered)
  } catch {
    return null
  }
}

function normalizeAnalysis(rawText: string, rows: any[]) {
  const parsed = tryParseAnalysis(rawText)
  const rowIds = new Set(rows.map((row) => row.id))
  const findings = Array.isArray(parsed.findings) ? parsed.findings : []
  const normalizedFindings = findings.slice(0, 12).map((finding: any, index: number) => ({
    id: String(finding.id ?? `${finding.type ?? "finding"}-${index + 1}`),
    type: finding.type ?? "other",
    title: String(finding.title ?? "Review rows").slice(0, 80),
    rationale: String(finding.rationale ?? "").slice(0, 400),
    confidence: Math.max(0, Math.min(1, Number(finding.confidence ?? 0.7))),
    affected_row_ids: Array.isArray(finding.affected_row_ids)
      ? finding.affected_row_ids.filter((id: string) => rowIds.has(id)).slice(0, 200)
      : [],
    proposed_action: finding.proposed_action?.kind
      ? {
          kind: finding.proposed_action.kind === "exclude" ? "exclude" : "set_field",
          field: finding.proposed_action.field ?? "expense_category",
          value: finding.proposed_action.value ?? "",
        }
      : { kind: "set_field", field: "expense_category", value: "Other" },
  })).filter((finding: any) => finding.affected_row_ids.length > 0)

  return {
    summary: String(parsed.summary ?? "Spreadsheet rows are ready for review. Confirm categories, currencies, and rows that should be excluded before reporting.").slice(0, 700),
    best_fit_report: ["Business Expense Report", "Tax Bundle", "Income Summary", "Contract Summary", "Mixed"].includes(parsed.best_fit_report)
      ? parsed.best_fit_report
      : "Mixed",
    totals: {
      ready: Number(parsed.totals?.ready ?? rows.filter((row) => row.normalization_status === "normalized").length),
      needs_review: Number(parsed.totals?.needs_review ?? rows.filter((row) => Number(row.confidence_score ?? 1) < 0.7).length),
      excluded: Number(parsed.totals?.excluded ?? rows.filter((row) => row.normalization_status === "excluded").length),
    },
    findings: normalizedFindings,
  }
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

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

  const file_id = body.file_id
  if (!file_id) {
    return new Response(JSON.stringify({ error: "file_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  const isServiceRole = token === SUPABASE_SERVICE_ROLE_KEY
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  let authorizedUserId: string | null = null
  if (!isServiceRole) {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    authorizedUserId = data.user.id
  }

  try {
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, user_id, filename, document_type, source_rows_json")
      .eq("id", file_id)
      .single()
    if (fileError || !file) throw new Error("File not found")
    if (!isServiceRole && file.user_id !== authorizedUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const allowed = await checkRateLimit(supabase, file.user_id)
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: rows, error: rowsError } = await supabase
      .from("document_fields")
      .select("id, file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, income_source, payment_method, confidence_score, normalization_status, raw_json, created_at")
      .eq("file_id", file_id)
      .order("created_at", { ascending: true })
      .limit(1000)
    if (rowsError) throw new Error(rowsError.message)

    const compactRows = (rows ?? []).slice(0, 250).map((row: any, index: number) => ({
      id: row.id,
      index: index + 1,
      vendor_name: row.vendor_name,
      employer_name: row.employer_name,
      date: row.document_date,
      amount: row.total_amount ?? row.gross_income ?? row.net_income,
      currency: row.currency,
      category: row.expense_category ?? row.income_source,
      payment_method: row.payment_method,
      confidence_score: row.confidence_score,
      normalization_status: row.normalization_status,
      source_index: row.raw_json?.source_index ?? index,
      source_row: Array.isArray(file.source_rows_json) ? file.source_rows_json[row.raw_json?.source_index ?? index] : null,
    }))

    const deterministicFindings = buildCurrencyMissingFindings(rows ?? [])

    const systemPrompt = `You are AVIntelligence's spreadsheet analysis engine. Return only valid JSON matching the requested schema. Write in confident operator-briefing voice. Do not use chatbot phrases like "I think", "it seems", "you might want to", or hedging. Prefer concrete findings that can be applied to rows.

CANONICAL FIELD NAMES (use these EXACT names in proposed_action.field):
- vendor_name (NOT "vendor", NOT "supplier")
- employer_name (NOT "employer")
- document_date (NOT "date", NOT "transaction_date")
- currency
- total_amount (NOT "amount", NOT "total")
- gross_income
- net_income
- tax_amount (NOT "tax")
- discount_amount (NOT "discount")
- expense_category (NOT "category", NOT "expense_type")
- payment_method
- invoice_number (NOT "invoice", NOT "ref")
- period_start
- period_end
- counterparty_name

For exclusion findings, set proposed_action.kind = "exclude" and omit the field. The save handler will set normalization_status to 'excluded'.

PROPOSED ACTION RULES (the proposed_action.kind MUST match the finding type):

Finding types that REQUIRE proposed_action.kind = "exclude":
- exclude_subtotals
- exclude_sheet
- exclude (generic)
These actions remove rows from analytics by setting normalization_status='excluded'.
For these types, OMIT proposed_action.field and proposed_action.value.

Finding types that REQUIRE proposed_action.kind = "set_field":
- bulk_category — proposed_action.field = "expense_category", value = canonical category name
- currency_missing — proposed_action.field = "currency", value = ISO currency code
- currency_mismatch — proposed_action.field = "currency", value = ISO currency code
- vendor_low_confidence — proposed_action.field = "vendor_name", value = canonical vendor
- any other field-update finding — specify field (canonical name) and value

Finding types that may use either kind depending on intent:
- recurring_detection — typically informational; if marking, use set_field on a metadata field; if no clear field, omit proposed_action entirely
- contract_payment_schedule — typically informational; same guidance

Do NOT generate set_field with empty value as a way to "soft-exclude" rows.
If the finding's intent is to remove rows from reports, use kind="exclude".

Do NOT use shorthand or alternative field names. Do NOT invent new fields. Use exactly the names above.`
    const prompt = JSON.stringify({
      task: "Analyze spreadsheet-derived financial rows and propose safe refinement actions.",
      file: { filename: file.filename, document_type: file.document_type },
      schema: {
        summary: "2-3 sentence editorial paragraph",
        best_fit_report: ["Business Expense Report", "Tax Bundle", "Income Summary", "Contract Summary", "Mixed"],
        totals: { ready: "int", needs_review: "int", excluded: "int" },
        findings: [{
          id: "stable id",
          type: ["exclude_subtotals", "bulk_category", "currency_missing", "currency_mismatch", "vendor_low_confidence", "exclude_sheet", "recurring_detection", "contract_payment_schedule", "other"],
          title: "3-6 words",
          rationale: "1-2 sentences",
          confidence: "0..1",
          affected_row_ids: ["document_fields.id"],
          proposed_action: { kind: ["exclude", "set_field"], field: "field name", value: "string" },
        }],
      },
      rules: [
        "Use exclude for subtotal, header, duplicate, blank, or non-transaction rows.",
        "Generate currency_missing when rows have null, empty, or placeholder currency and row context strongly suggests an ISO currency.",
        "Use set_field for category or currency fixes only when evidence is strong.",
        "Never invent row IDs; affected_row_ids must come from provided rows.",
      ],
      rows: compactRows,
    })

    const { rawText, provider } = await callAI(systemPrompt, prompt)
    const analysis = normalizeAnalysis(rawText, rows ?? [])
    const existingCurrencyMissingKeys = new Set(
      analysis.findings
        .filter((finding: any) => finding.type === "currency_missing")
        .map((finding: any) => `${finding.proposed_action?.value}:${finding.affected_row_ids.join(",")}`),
    )
    const currencyMissingFindings = deterministicFindings.filter((finding) =>
      !existingCurrencyMissingKeys.has(`${finding.proposed_action.value}:${finding.affected_row_ids.join(",")}`),
    )
    analysis.findings = [...currencyMissingFindings, ...analysis.findings].slice(0, 12)
    const payload = {
      ...analysis,
      extraction_payload: (rows ?? []).slice(0, 1000),
      source_row_count: rows?.length ?? 0,
      provider,
      analyzed_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from("files")
      .update({ analysis_json: payload, analyzed_at: payload.analyzed_at })
      .eq("id", file_id)
    if (updateError) throw new Error(updateError.message)

    logEvent(FN, "analysis_completed", { file_id, user_id: file.user_id, findings: analysis.findings.length, provider })
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    logError(FN, "unhandled", error, { file_id })
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
