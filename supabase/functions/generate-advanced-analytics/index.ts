import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY      = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY         = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AI_PROVIDER            = Deno.env.get("ANALYTICS_PROVIDER") ?? Deno.env.get("AI_PROVIDER") ?? "anthropic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a financial analytics AI that generates dashboard widget configurations.

You receive a user's financial data summary. Your job is to generate 3-5 insightful widget configurations that surface meaningful patterns, outliers, or observations from their data.

Return ONLY a valid JSON object in this exact format — no markdown, no explanation:
{
  "widgets": [
    {
      "widget_type": "<type>",
      "title": "<short title>",
      "description": "<one-line subtitle>",
      "insight": "<one sentence AI insight specific to their data>"
    }
  ]
}

Available widget_type values (use ONLY these):
- "kpi-income"     — gross income total
- "kpi-expenses"   — total expenses
- "kpi-net"        — net position (income - expenses)
- "kpi-savings"    — savings rate %
- "kpi-tax"        — tax burden rate
- "bar-chart"      — monthly income vs expenses bar
- "line-chart"     — income/expense trend over time
- "area-chart"     — cumulative income/expense area
- "pie-chart"      — expense category breakdown

Rules:
- Choose widget types that are most relevant to THIS user's actual data
- The insight must reference specific numbers from their data (amounts, percentages, categories)
- Avoid duplicating widget types unless the insight angle is genuinely different
- If data is sparse, generate fewer widgets (minimum 2)
- Title should be personalized ("Your Top Expense" not "Category Breakdown")
- Keep insight to 1 sentence, max 120 characters`

async function callAI(prompt: string): Promise<string> {
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
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
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
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: prompt },
        ],
        max_tokens: 1024,
      }),
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${await res.text()}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ""
  }
}

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

  const { user_id } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // 1. Fetch user data
    const { data: userFiles } = await supabase
      .from("files")
      .select("id, document_type")
      .eq("user_id", user_id)

    if (!userFiles?.length) {
      return new Response(JSON.stringify({ error: "No documents found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const fileIds = userFiles.map((f: any) => f.id)

    const { data: fields } = await supabase
      .from("document_fields")
      .select("file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, tax_amount")
      .in("file_id", fileIds)

    const f = fields ?? []
    const currency = f.find((x: any) => x.currency)?.currency ?? "PHP"

    const totalIncome   = f.filter((x: any) => x.gross_income != null).reduce((s: number, x: any) => s + Number(x.gross_income), 0)
    const totalExpenses = f.filter((x: any) => x.total_amount != null && x.gross_income == null).reduce((s: number, x: any) => s + Number(x.total_amount), 0)
    const netPosition   = totalIncome - totalExpenses
    const savingsRate   = totalIncome > 0 ? ((netPosition / totalIncome) * 100).toFixed(1) : "0"
    const totalTax      = f.filter((x: any) => x.tax_amount != null).reduce((s: number, x: any) => s + Number(x.tax_amount), 0)
    const taxRate       = totalIncome > 0 ? ((totalTax / totalIncome) * 100).toFixed(1) : "0"

    const categories: Record<string, number> = {}
    for (const x of f) {
      if (x.expense_category && x.total_amount != null && x.gross_income == null) {
        categories[x.expense_category] = (categories[x.expense_category] ?? 0) + Number(x.total_amount)
      }
    }
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]

    const employers  = [...new Set(f.filter((x: any) => x.employer_name).map((x: any) => x.employer_name))]
    const dateRange  = f.filter((x: any) => x.document_date).map((x: any) => x.document_date).sort()
    const months     = [...new Set(dateRange.map((d: string) => d.slice(0, 7)))].length

    // 2. Expire old ephemeral widgets for this user (cleanup)
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)
      .eq("is_plotted", false)
      .lt("expires_at", new Date().toISOString())

    // 3. Build prompt
    const prompt = `Financial data for analysis:

Currency: ${currency}
Documents: ${userFiles.length} files (${[...new Set(userFiles.map((f: any) => f.document_type))].join(", ")})
Date range: ${dateRange[0] ?? "unknown"} to ${dateRange[dateRange.length - 1] ?? "unknown"} (${months} months)

Income:
- Total gross income: ${totalIncome.toLocaleString()} ${currency}
- Employers: ${employers.join(", ") || "none"}
- Net income after deductions: ${netPosition.toLocaleString()} ${currency}
- Savings rate: ${savingsRate}%

Expenses:
- Total expenses: ${totalExpenses.toLocaleString()} ${currency}
- Top category: ${topCategory ? `${topCategory[0]} (${topCategory[1].toLocaleString()} ${currency})` : "none"}
- All categories: ${Object.entries(categories).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(", ") || "none"}

Tax:
- Total tax paid: ${totalTax.toLocaleString()} ${currency}
- Tax rate: ${taxRate}%

Generate 3-5 widget configurations that surface the most interesting insights from this data.`

    // 4. Call AI
    const rawText = await callAI(prompt)
    if (!rawText) throw new Error("Empty response from AI")

    let parsed: any
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim())
    } catch {
      throw new Error(`Failed to parse AI output: ${rawText}`)
    }

    const generatedWidgets = parsed.widgets ?? []
    if (!generatedWidgets.length) throw new Error("AI returned no widgets")

    // 5. Insert new advanced_widgets (ephemeral by default — 7 day TTL)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const rows = generatedWidgets.map((w: any) => ({
      user_id,
      widget_type:  w.widget_type,
      title:        w.title,
      description:  w.description ?? null,
      insight:      w.insight ?? null,
      is_starred:   false,
      is_plotted:   false,
      expires_at:   expiresAt,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from("advanced_widgets")
      .insert(rows)
      .select()

    if (insertError) throw new Error(`Insert failed: ${insertError.message}`)

    // 6. Update last analytics run count so "New data" indicator resets
    // (client handles localStorage — just return success)

    return new Response(
      JSON.stringify({ success: true, count: inserted?.length ?? 0, widgets: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (error: any) {
    console.error("generate-advanced-analytics error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
