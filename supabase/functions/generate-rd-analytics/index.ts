import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"

// ─────────────────────────────────────────────────────────────────────────────
// generate-rd-analytics
// Sonnet-class reasoning layer that complements the Haiku spec generator.
// Sonnet acts as a data analyst: receives the full stack (raw_json excerpts
// + normalized fields + analytics profile) and returns 1–2 rd-insight widgets
// with a transformed data[] array that the client renders directly. Used for
// cross-doc correlation, raw_json intelligence, and anomaly detection — angles
// Haiku cannot reliably derive.
//
// Gated by corpus signature (months≥6, transactions≥12) and by entitlement —
// sparse accounts skip this call entirely to avoid weak output.
// ─────────────────────────────────────────────────────────────────────────────

const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const SONNET_MODEL              = Deno.env.get("RD_ANALYTICS_MODEL") ?? "claude-sonnet-4-6"
const RD_ANALYTICS_PROVIDERS    = providerChain("RD_ANALYTICS", "anthropic", "openai")

// Thresholds for R&D run eligibility. Kept in lock-step with the client-side
// readiness gate in app/tools/smart-dashboard/page.tsx — both must agree.
const RD_MIN_MONTHS        = 6
const RD_MIN_TRANSACTIONS  = 12

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

function hasActiveEntitlement(row: { status: string | null; current_period_end: string | null } | null): boolean {
  if (!row?.status) return false
  if (row.status === "pro") return true
  if (row.status === "day_pass" || row.status === "gift_code") {
    if (!row.current_period_end) return false
    return new Date(row.current_period_end).getTime() >= Date.now()
  }
  return false
}

const RD_SYSTEM_PROMPT = `You are a senior financial data analyst producing advanced visualizations for AVIntelligence.

Your role is DIFFERENT from the standard widget generator. You do not propose chart specs —
you perform the data transformation yourself and return a ready-to-render data array.

Generate 1 or 2 widgets. Fewer is strictly better than filler. Every widget must be one of
these three angles:

1. cross_doc_correlation — reasoning across multiple documents to surface a relationship
   standard aggregations miss. Examples: months where expense share-of-income inverted;
   vendor-to-category drift; recurring-spend envelope vs one-off spike months; merchant
   domain concentration trending with a specific income source; geographic concentration
   of spend by region.

2. raw_json_intelligence — mining unmapped fields in raw_json (transaction time,
   branch names, line-item product descriptions, payment terms, reference numbers)
   for patterns the normalized columns discarded. Examples: time-of-day spend curve;
   branch-level spend concentration for a single vendor; line-item-level product
   category within a vendor; recurring SKU patterns.

3. anomaly_detection — spotting unusual months/vendors/categories vs the user's own
   baseline. Examples: single month spending >2σ above trailing baseline; vendor
   appearing for the first time at high amount; tax-to-revenue ratio inversion;
   recurrence-expected gaps.

Spending-first priority: when both a spending and income-vs-expenses angle are
data-sufficient, prefer the spending angle. The income-vs-expenses story is already
covered by the standard dashboard — do not repeat it.

Novelty and anti-duplication rules:
- You will receive haiku_chart_families[] — the families the spec-level generator
  already produced. Do NOT produce a widget whose business question overlaps with
  any family in that list.
- Do not restate a view the standard dashboard already provides (monthly income vs
  expenses; top-N category; top-N vendor; net trend).
- Every widget must pick a concrete, data-cited insight — no generic summaries.

Sufficiency rules:
- If there is not enough signal for a genuine insight, return zero widgets.
  { "widgets": [] } is a valid and preferred response to filler.
- Do not fabricate numbers. Every value in data[] must be derivable from the input.
- Do not guess thresholds you cannot compute. Use the user's own baseline.

Output contract — return ONLY valid JSON, no markdown, no code fences:

{
  "widgets": [
    {
      "angle": "cross_doc_correlation" | "raw_json_intelligence" | "anomaly_detection",
      "chart_type": "line-chart" | "bar-chart" | "area-chart" | "pie-chart",
      "title": "<specific, data-driven, ≤60 chars>",
      "description": "<one-line subtitle explaining the analytic angle>",
      "insight": "<1 sentence citing at least one number from data[]; must be literally true given data>",
      "data": [ { "<x_key>": <value>, "<data_key>": <number>, ... } ],
      "x_key": "<the category axis key present in every data row>",
      "data_key": "<the numeric axis key present in every data row>"
    }
  ]
}

Constraints on data[]:
- Between 3 and 24 points inclusive.
- Every row must have both x_key and data_key populated.
- Numeric values must be raw numbers, not pre-formatted strings.
- For pie-chart use "name" as x_key and "value" as data_key.
- For line/area/bar time series use "month" (YYYY-MM) or "period" as x_key.`

// ── AI call ───────────────────────────────────────────────────────────────────
async function callProvider(provider: AiProvider, systemPrompt: string, userPrompt: string): Promise<string> {
  if (provider === "anthropic") {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: SONNET_MODEL,
        max_tokens: 4096,
        system: systemPrompt + "\n\nIMPORTANT: Return ONLY a valid JSON object. No markdown, no code blocks.",
        messages: [{ role: "user", content: userPrompt }],
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ""
  }

  throw new Error(`Unsupported R&D analytics provider: ${provider}`)
}

async function callAI(systemPrompt: string, userPrompt: string): Promise<{ rawText: string; provider: AiProvider }> {
  let lastError: unknown = null
  for (const provider of RD_ANALYTICS_PROVIDERS) {
    try {
      const rawText = await callProvider(provider, systemPrompt, userPrompt)
      if (!rawText) throw new Error(`Empty response from ${provider}`)
      return { rawText, provider }
    } catch (error) {
      lastError = error
      console.error(`R&D analytics provider ${provider} failed:`, error instanceof Error ? error.message : String(error))
      if (!isProviderFailure(error)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All R&D analytics providers failed")
}

// ── Sampling helpers ──────────────────────────────────────────────────────────
// Sonnet prompts are reasoning-heavy. Unbounded raw_json dumps blow out context
// and degrade output. We send a bounded, stratified sample: top 20 docs by
// amount, plus up to 10 random additional docs, and extract only interesting
// raw_json keys rather than the full nested blob.

const RAW_JSON_KEYS_OF_INTEREST = [
  "transaction_time", "time", "branch", "branch_name", "store_number",
  "location", "address", "city", "region", "country",
  "reference_number", "transaction_id", "payment_terms", "due_date",
  "items", "products", "description",
]

function extractRawJsonExcerpt(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null
  const out: Record<string, unknown> = {}
  for (const key of RAW_JSON_KEYS_OF_INTEREST) {
    const value = (raw as Record<string, unknown>)[key]
    if (value !== undefined && value !== null) out[key] = value
  }
  return Object.keys(out).length > 0 ? out : null
}

function sampleDocs<T extends { total_amount?: number | null; gross_income?: number | null }>(
  rows: T[], topN: number, randomN: number,
): T[] {
  const withAmount = rows.map((r) => ({
    r, amt: Number(r.total_amount ?? r.gross_income ?? 0),
  }))
  const sortedByAmount = [...withAmount].sort((a, b) => b.amt - a.amt)
  const top = sortedByAmount.slice(0, topN).map((x) => x.r)
  const topSet = new Set(top)
  const remaining = rows.filter((r) => !topSet.has(r))
  const shuffled = [...remaining].sort(() => Math.random() - 0.5)
  return [...top, ...shuffled.slice(0, randomN)]
}

// ── Main handler ──────────────────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
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

  const { user_id, haiku_chart_families } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // ── Auth: require user JWT matching user_id OR service role ──
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
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
    if (userErr || !userData?.user || userData.user.id !== user_id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // ── Entitlement gate ──────────────────────────────────────────────────────
  if (!isServiceRole) {
    const { data: subscriptionRow, error: subscriptionErr } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user_id)
      .maybeSingle()

    if (subscriptionErr) {
      return new Response(JSON.stringify({ error: "Failed to verify entitlement" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
    if (!hasActiveEntitlement(subscriptionRow)) {
      return new Response(JSON.stringify({ error: "Active premium access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }
  }

  try {
    // ── 1. Load corpus ─────────────────────────────────────────────────────
    const { data: userFiles } = await supabase
      .from("files")
      .select("id, document_type")
      .eq("user_id", user_id)

    if (!userFiles?.length) {
      return new Response(JSON.stringify({ skipped: true, reason: "no_documents", widgets: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const fileIds = userFiles.map((f: any) => f.id)
    const fileTypeMap: Record<string, string> = {}
    for (const file of userFiles) fileTypeMap[file.id] = file.document_type

    const { data: fields } = await supabase
      .from("document_fields")
      .select([
        "file_id", "vendor_name", "vendor_normalized", "employer_name",
        "counterparty_name", "document_date", "period_start", "period_end",
        "currency", "jurisdiction", "total_amount", "gross_income", "net_income",
        "tax_amount", "discount_amount", "expense_category", "income_source",
        "payment_method", "merchant_domain", "merchant_address_city",
        "merchant_address_region", "merchant_address_country",
        "is_recurring", "recurrence_cadence", "line_items", "raw_json",
      ].join(", "))
      .in("file_id", fileIds)
      .neq("normalization_status", "excluded")

    const rows = (fields ?? []) as any[]

    // ── 2. Sufficiency gate ────────────────────────────────────────────────
    const months = new Set<string>()
    for (const r of rows) {
      if (r.document_date) months.add(String(r.document_date).slice(0, 7))
    }
    const transactionCount = rows.filter((r) => r.total_amount != null || r.gross_income != null).length

    if (months.size < RD_MIN_MONTHS || transactionCount < RD_MIN_TRANSACTIONS) {
      return new Response(
        JSON.stringify({
          skipped: true,
          reason: "below_threshold",
          threshold: { months: RD_MIN_MONTHS, transactions: RD_MIN_TRANSACTIONS },
          actual:    { months: months.size, transactions: transactionCount },
          widgets:   [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const currency = rows.find((x) => x.currency)?.currency ?? "PHP"
    const symbol = currency === "PHP" ? "₱" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"

    // ── 3. Aggregations Sonnet needs as grounding ──────────────────────────
    const INCOME_TYPES  = ["payslip", "income_statement"]
    const EXPENSE_TYPES = ["receipt", "invoice"]
    const isIncomeRow  = (x: any) => {
      const dt = fileTypeMap[x.file_id]
      return dt === "csv_export" ? x.gross_income != null : INCOME_TYPES.includes(dt)
    }
    const isExpenseRow = (x: any) => {
      const dt = fileTypeMap[x.file_id]
      return dt === "csv_export" ? (x.gross_income == null && x.total_amount != null) : EXPENSE_TYPES.includes(dt)
    }
    const expenseRows = rows.filter(isExpenseRow)
    const incomeRows  = rows.filter(isIncomeRow)

    // Monthly series for anomaly baselining
    const monthlySpend: Record<string, number> = {}
    const monthlyIncome: Record<string, number> = {}
    const monthlyCount: Record<string, number> = {}
    for (const r of rows) {
      if (!r.document_date) continue
      const mo = String(r.document_date).slice(0, 7)
      monthlyCount[mo] = (monthlyCount[mo] ?? 0) + 1
      if (isExpenseRow(r)) monthlySpend[mo]  = (monthlySpend[mo]  ?? 0) + Number(r.total_amount ?? 0)
      if (isIncomeRow(r))  monthlyIncome[mo] = (monthlyIncome[mo] ?? 0) + Number(r.gross_income ?? r.total_amount ?? 0)
    }
    const sortedMonths = Object.keys(monthlyCount).sort()
    const monthlySeries = sortedMonths.map((m) => ({
      month:    m,
      spend:    monthlySpend[m]  ?? 0,
      income:   monthlyIncome[m] ?? 0,
      count:    monthlyCount[m]  ?? 0,
    }))

    // Merchant domain concentration by month
    const domainByMonth: Record<string, Record<string, number>> = {}
    for (const r of expenseRows) {
      if (!r.document_date || !r.merchant_domain || r.total_amount == null) continue
      const mo = String(r.document_date).slice(0, 7)
      if (!domainByMonth[mo]) domainByMonth[mo] = {}
      domainByMonth[mo][r.merchant_domain] = (domainByMonth[mo][r.merchant_domain] ?? 0) + Number(r.total_amount)
    }

    // Recurrence signal
    const recurringSpend  = expenseRows.filter((r) => r.is_recurring === true).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const oneOffSpend     = expenseRows.filter((r) => r.is_recurring !== true).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
    const recurringByMonth: Record<string, number> = {}
    const oneOffByMonth:    Record<string, number> = {}
    for (const r of expenseRows) {
      if (!r.document_date || r.total_amount == null) continue
      const mo = String(r.document_date).slice(0, 7)
      if (r.is_recurring === true) recurringByMonth[mo] = (recurringByMonth[mo] ?? 0) + Number(r.total_amount)
      else                          oneOffByMonth[mo]    = (oneOffByMonth[mo]    ?? 0) + Number(r.total_amount)
    }

    // Geographic concentration
    const regionSpend: Record<string, number> = {}
    const citySpend:   Record<string, number> = {}
    for (const r of expenseRows) {
      if (r.total_amount == null) continue
      if (r.merchant_address_region) regionSpend[r.merchant_address_region] = (regionSpend[r.merchant_address_region] ?? 0) + Number(r.total_amount)
      if (r.merchant_address_city)   citySpend[r.merchant_address_city]     = (citySpend[r.merchant_address_city]     ?? 0) + Number(r.total_amount)
    }

    // Vendor concentration
    const vendorSpend: Record<string, { total: number; count: number; domain: string | null }> = {}
    for (const r of expenseRows) {
      const vendor = r.vendor_normalized ?? r.vendor_name
      if (!vendor || r.total_amount == null) continue
      if (!vendorSpend[vendor]) vendorSpend[vendor] = { total: 0, count: 0, domain: r.merchant_domain ?? null }
      vendorSpend[vendor].total += Number(r.total_amount)
      vendorSpend[vendor].count += 1
    }
    const topVendors = Object.entries(vendorSpend)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 15)

    // ── 4. raw_json sample (stratified) ────────────────────────────────────
    const sampled = sampleDocs(rows, 20, 10)
    const rawExcerpts = sampled
      .map((r) => ({
        doc_date: r.document_date,
        vendor:   r.vendor_normalized ?? r.vendor_name,
        domain:   r.merchant_domain,
        amount:   r.total_amount ?? r.gross_income,
        excerpt:  extractRawJsonExcerpt(r.raw_json),
        line_item_count: Array.isArray(r.line_items) ? r.line_items.length : 0,
      }))
      .filter((r) => r.excerpt != null || r.line_item_count > 0)
      .slice(0, 25)

    // ── 5. Load analytics profile ──────────────────────────────────────────
    const { data: profile } = await supabase
      .from("user_analytics_profile")
      .select("top_vendors, payment_methods, monthly_deltas, discount_total, discount_events, income_sources, tax_timeline, dominant_category, avg_monthly_income, avg_monthly_expenses, document_count, months_tracked")
      .eq("user_id", user_id)
      .maybeSingle()

    // ── 6. Build prompt ────────────────────────────────────────────────────
    const userPrompt = `RD analytics input for user ${user_id}.

Currency: ${currency} (symbol ${symbol})
Months tracked: ${months.size}
Transactions: ${transactionCount}
Haiku chart families already produced: ${(haiku_chart_families ?? []).join(", ") || "none"}

MONTHLY SERIES (for baseline/anomaly detection):
${JSON.stringify(monthlySeries)}

MERCHANT DOMAIN BY MONTH (top domain totals, for correlation):
${JSON.stringify(domainByMonth)}

RECURRENCE BY MONTH:
recurring_total=${recurringSpend} oneoff_total=${oneOffSpend}
${JSON.stringify({ recurring: recurringByMonth, oneoff: oneOffByMonth })}

GEOGRAPHIC SPEND:
regions=${JSON.stringify(regionSpend)}
cities=${JSON.stringify(citySpend)}

TOP VENDORS (name, total, count, domain):
${JSON.stringify(topVendors)}

RAW_JSON EXCERPTS (stratified sample):
${JSON.stringify(rawExcerpts)}

USER ANALYTICS PROFILE:
${JSON.stringify(profile ?? {})}

Produce 1–2 rd-insight widgets following the output contract. Return { "widgets": [] } if
no genuinely non-redundant insight is data-supported.`

    // ── 7. Call Sonnet ─────────────────────────────────────────────────────
    const { rawText, provider } = await callAI(RD_SYSTEM_PROMPT, userPrompt)
    if (!rawText) throw new Error(`Empty response from ${provider}`)

    let parsed: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON object found in response")
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error(`Failed to parse R&D analytics output from ${provider}: ${rawText.slice(0, 500)}`)
    }

    const ALLOWED_CHART_TYPES = new Set(["line-chart", "area-chart", "bar-chart", "pie-chart"])
    const ALLOWED_ANGLES      = new Set(["cross_doc_correlation", "raw_json_intelligence", "anomaly_detection"])

    const rawWidgets: any[] = Array.isArray(parsed.widgets) ? parsed.widgets : []
    const validated = rawWidgets
      .filter((w) => ALLOWED_CHART_TYPES.has(w.chart_type))
      .filter((w) => ALLOWED_ANGLES.has(w.angle))
      .filter((w) => typeof w.title === "string" && w.title.trim().length > 0)
      .filter((w) => Array.isArray(w.data) && w.data.length >= 3 && w.data.length <= 24)
      .filter((w) => typeof w.x_key === "string" && typeof w.data_key === "string")
      .filter((w) => w.data.every((row: any) =>
        row != null && typeof row === "object" &&
        row[w.x_key] != null && typeof row[w.data_key] === "number" && Number.isFinite(row[w.data_key]),
      ))
      .slice(0, 2)

    if (validated.length === 0) {
      return new Response(
        JSON.stringify({ success: true, count: 0, widgets: [], skipped: false, reason: "no_valid_widgets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // ── 8a. Clear stale, non-starred rd-insight rows before inserting the
    //       new batch. Scoped strictly to widget_type='rd-insight' so parallel
    //       Haiku runs don't step on each other.
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)
      .eq("widget_type", "rd-insight")

    // ── 8b. Insert rd-insight widgets (7-day TTL unless starred/plotted) ───
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const rowsToInsert = validated.map((w: any) => ({
      user_id,
      widget_type: "rd-insight",
      title:       w.title,
      description: w.description ?? null,
      insight:     w.insight ?? null,
      config: {
        source:     "rd",
        angle:      w.angle,
        chart_type: w.chart_type,
        data:       w.data,
        x_key:      w.x_key,
        data_key:   w.data_key,
        currency,
      },
      is_starred: false,
      is_plotted: false,
      expires_at: expiresAt,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from("advanced_widgets")
      .insert(rowsToInsert)
      .select()

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

    return new Response(
      JSON.stringify({ success: true, count: inserted?.length ?? 0, widgets: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error: any) {
    console.error("generate-rd-analytics error:", error instanceof Error ? error.message : String(error))
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
