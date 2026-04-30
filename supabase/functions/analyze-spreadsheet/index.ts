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
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1800,
        temperature: 0.1,
        system: systemPrompt,
        messages: [{ role: "user", content: prompt }],
      }),
    })
    if (!res.ok) throw new Error(`Anthropic API error: ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ""
  }

  if (provider === "openai") {
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 1800,
      }),
    })
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

function normalizeAnalysis(rawText: string, rows: any[]) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON object found in analysis output: ${rawText}`)
  const parsed = JSON.parse(jsonMatch[0])
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

    const systemPrompt = `You are AVIntelligence's spreadsheet analysis engine. Return only valid JSON matching the requested schema. Write in confident operator-briefing voice. Do not use chatbot phrases like "I think", "it seems", "you might want to", or hedging. Prefer concrete findings that can be applied to rows.`
    const prompt = JSON.stringify({
      task: "Analyze spreadsheet-derived financial rows and propose safe refinement actions.",
      file: { filename: file.filename, document_type: file.document_type },
      schema: {
        summary: "2-3 sentence editorial paragraph",
        best_fit_report: ["Business Expense Report", "Tax Bundle", "Income Summary", "Contract Summary", "Mixed"],
        totals: { ready: "int", needs_review: "int", excluded: "int" },
        findings: [{
          id: "stable id",
          type: ["exclude_subtotals", "bulk_category", "currency_mismatch", "vendor_low_confidence", "exclude_sheet", "recurring_detection", "contract_payment_schedule", "other"],
          title: "3-6 words",
          rationale: "1-2 sentences",
          confidence: "0..1",
          affected_row_ids: ["document_fields.id"],
          proposed_action: { kind: ["exclude", "set_field"], field: "field name", value: "string" },
        }],
      },
      rules: [
        "Use exclude for subtotal, header, duplicate, blank, or non-transaction rows.",
        "Use set_field for category or currency fixes only when evidence is strong.",
        "Never invent row IDs; affected_row_ids must come from provided rows.",
      ],
      rows: compactRows,
    })

    const { rawText, provider } = await callAI(systemPrompt, prompt)
    const analysis = normalizeAnalysis(rawText, rows ?? [])
    const payload = {
      ...analysis,
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
