import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"

const ANTHROPIC_API_KEY      = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY         = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!

const SUMMARY_PROVIDERS = providerChain("CONTEXT", "anthropic", "openai", ["SUMMARY_PROVIDER"])

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

const SYSTEM_PROMPT = `You are a personal financial analyst AI. You receive structured data extracted from a user's financial documents (receipts, invoices, payslips, etc.).

Write a concise, friendly, and insightful Smart Dashboard context summary for the user. Use natural language — no headers, no markdown. Write 3-5 sentences max.

Focus on:
- What: the clearest observed financial pattern from the provided fields
- So what: why that pattern matters for the user's dashboard view
- Now what: one practical next inspection point or caveat
- Overall financial picture (income vs expenses), only when supported by the provided data
- Notable patterns, standout categories, employers, vendors, or document mix
- Tone: warm, professional, helpful — like a trusted financial advisor

Rules:
- Do not invent causes, forecasts, benchmarks, legal/tax conclusions, or advice not supported by the data.
- If data is sparse, mixed-currency, or incomplete, say that briefly and keep the summary useful.
- Do not mention technical terms like "document_fields" or "raw_json". Speak directly to the user.`

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error: ${err}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

async function callOpenAI(prompt: string): Promise<string> {
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 512,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI API error: ${err}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ""
}

async function callProvider(provider: AiProvider, prompt: string): Promise<string> {
  if (provider === "anthropic") return await callAnthropic(prompt)
  if (provider === "openai") return await callOpenAI(prompt)
  throw new Error(`Unsupported context provider: ${provider}`)
}

async function callWithFallback(prompt: string): Promise<{ summary: string; provider: AiProvider }> {
  let lastError: unknown = null
  for (const provider of SUMMARY_PROVIDERS) {
    try {
      const summary = await callProvider(provider, prompt)
      if (!summary) throw new Error(`Empty response from ${provider}`)
      return { summary, provider }
    } catch (error) {
      lastError = error
      console.error(`context provider ${provider} failed:`, error instanceof Error ? error.message : String(error))
      if (!isProviderFailure(error)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All context providers failed")
}

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

  const { user_id } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

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
    // 1. Fetch user's files + document_fields
    const { data: userFiles } = await supabase
      .from("files")
      .select("id, filename, document_type")
      .eq("user_id", user_id)

    if (!userFiles?.length) {
      return new Response(JSON.stringify({ error: "No documents found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const fileIds = userFiles.map((f) => f.id)

    const { data: fields } = await supabase
      .from("document_fields")
      .select("file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, tax_amount, discount_amount, line_items")
      .in("file_id", fileIds)
      .neq("normalization_status", "excluded")

    // 2. Build a concise data summary for the AI prompt
    const totalIncome = (fields ?? [])
      .filter((f) => f.gross_income != null)
      .reduce((sum, f) => sum + Number(f.gross_income), 0)

    const totalExpenses = (fields ?? [])
      .filter((f) => f.total_amount != null && f.gross_income == null)
      .reduce((sum, f) => sum + Number(f.total_amount), 0)

    const categories: Record<string, number> = {}
    for (const f of fields ?? []) {
      if (f.expense_category && f.total_amount != null && f.gross_income == null) {
        categories[f.expense_category] = (categories[f.expense_category] ?? 0) + Number(f.total_amount)
      }
    }

    const topCategories = Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat, amt]) => `${cat}: ${amt.toLocaleString()}`)

    const employers = [...new Set((fields ?? []).filter((f) => f.employer_name).map((f) => f.employer_name))]
    const vendors   = [...new Set((fields ?? []).filter((f) => f.vendor_name).map((f) => f.vendor_name))].slice(0, 5)
    const currency  = (fields ?? []).find((f) => f.currency)?.currency ?? "PHP"
    const currencies = [...new Set((fields ?? []).map((f) => f.currency).filter(Boolean))]
    const datedRows = (fields ?? []).filter((f) => f.document_date)
    const monthsTracked = [...new Set(datedRows.map((f) => String(f.document_date).slice(0, 7)))].length
    const documentTypes = [...new Set(userFiles.map((f) => f.document_type))]
    const dataQualityNotes = [
      monthsTracked > 0 ? `${monthsTracked} month${monthsTracked === 1 ? "" : "s"} with dated records` : "no dated records detected",
      currencies.length > 1 ? `mixed currencies detected: ${currencies.join(", ")}` : `primary currency: ${currency}`,
      topCategories.length ? "categorized expense data available" : "limited expense category data",
      employers.length ? "income source data available" : "limited income source data",
    ]

    const prompt = `Here is a summary of the user's financial documents:

Total documents: ${userFiles.length}
Document types: ${documentTypes.join(", ")}
Currency: ${currency}
Data quality context: ${dataQualityNotes.join("; ")}

Income:
- Total gross income: ${totalIncome.toLocaleString()} ${currency}
- Employers: ${employers.join(", ") || "none detected"}

Expenses:
- Total expenses: ${totalExpenses.toLocaleString()} ${currency}
- Top categories: ${topCategories.join(", ") || "none categorized"}
- Notable vendors: ${vendors.join(", ") || "none detected"}

Net position: ${(totalIncome - totalExpenses).toLocaleString()} ${currency}

Please write the Smart Dashboard context summary now using What / So What / Now What in natural prose.`

    // 3. Call AI
    const { summary, provider } = await callWithFallback(prompt)

    // 4. Upsert into context_summaries
    const now = new Date().toISOString()
    await supabase
      .from("context_summaries")
      .upsert({
        user_id,
        summary,
        generated_at:   now,
        document_count: userFiles.length,
        ai_provider:    provider,
      }, { onConflict: "user_id" })

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("generate-context-summary error:", error instanceof Error ? error.message : String(error))
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
