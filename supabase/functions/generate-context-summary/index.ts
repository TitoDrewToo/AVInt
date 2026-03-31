import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY      = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY         = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL           = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

// Switch between providers via Supabase Secret AI_PROVIDER = "anthropic" | "openai"
const AI_PROVIDER = Deno.env.get("AI_PROVIDER") ?? "anthropic"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const SYSTEM_PROMPT = `You are a personal financial analyst AI. You receive structured data extracted from a user's financial documents (receipts, invoices, payslips, etc.).

Write a concise, friendly, and insightful financial summary for the user. Use natural language — no bullet points, no headers, no markdown. Write 3-5 sentences max.

Focus on:
- Overall financial picture (income vs expenses)
- Notable patterns or standout items
- Any observations about spending categories
- Tone: warm, professional, helpful — like a trusted financial advisor

Do not mention technical terms like "document_fields" or "raw_json". Speak directly to the user.`

async function callAnthropic(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const prompt = `Here is a summary of the user's financial documents:

Total documents: ${userFiles.length}
Document types: ${[...new Set(userFiles.map((f) => f.document_type))].join(", ")}
Currency: ${currency}

Income:
- Total gross income: ${totalIncome.toLocaleString()} ${currency}
- Employers: ${employers.join(", ") || "none detected"}

Expenses:
- Total expenses: ${totalExpenses.toLocaleString()} ${currency}
- Top categories: ${topCategories.join(", ") || "none categorized"}
- Notable vendors: ${vendors.join(", ") || "none detected"}

Net position: ${(totalIncome - totalExpenses).toLocaleString()} ${currency}

Please write the financial summary now.`

    // 3. Call AI
    const summary = AI_PROVIDER === "anthropic"
      ? await callAnthropic(prompt)
      : await callOpenAI(prompt)

    if (!summary) throw new Error("Empty response from AI")

    // 4. Upsert into context_summaries
    const now = new Date().toISOString()
    await supabase
      .from("context_summaries")
      .upsert({
        user_id,
        summary,
        generated_at:   now,
        document_count: userFiles.length,
        ai_provider:    AI_PROVIDER,
      }, { onConflict: "user_id" })

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("generate-context-summary error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
