import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AI_PROVIDER               = Deno.env.get("ANALYTICS_PROVIDER") ?? Deno.env.get("AI_PROVIDER") ?? "anthropic"
// R&D gate — set this env var to your Supabase user UUID to unlock advanced features
const RD_USER_ID                = Deno.env.get("RD_USER_ID") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Upgrade chart prompt (all users) ──────────────────────────────────────────
// Haiku selects which standard chart types to upgrade with AI insight.
// Dedup is enforced against plotted_advanced_types — not existing_widget_types —
// so Haiku CAN generate an advanced version of a chart that's already on the
// standard dashboard (that's the upgrade). It just can't duplicate an already-
// plotted advanced widget of the same type.

const UPGRADE_SYSTEM_PROMPT = `You are a financial analytics AI that generates enhanced dashboard widget configurations.

You receive a user's financial data. Generate 2-3 widget configurations that surface the most valuable insights.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "widgets": [
    {
      "widget_type": "<type>",
      "title": "<specific data-driven title>",
      "description": "<one-line subtitle>",
      "insight": "<1 sentence insight with specific numbers or percentages from the data>"
    }
  ]
}

Available widget_type values (use ONLY these):
- "bar-chart"   — expense categories ranked by total spend
- "line-chart"  — income/expense trend over time
- "area-chart"  — cumulative income vs expenses comparison
- "pie-chart"   — expense category composition breakdown

Rules:
- DEDUP RULE: never output a widget_type that appears in already_plotted. If all 4 types are already plotted, return {"widgets": []}.
- Standard dashboard types (area-chart, bar-chart, pie-chart) are OK to use — your AI-enriched versions add insight the standard ones lack.
- DIMENSION RULE: each widget must cover a different dimension. No two widgets may share:
    TIME        → line-chart or area-chart (pick ONE, never both)
    COMPOSITION → pie-chart
    RANKING     → bar-chart
- TIME RULE: ALWAYS include one TIME dimension widget (line-chart or area-chart) unless it is already in already_plotted AND you cannot pick the other variant. Time trends are the most valuable insight for financial data.
- Maximum 3 widgets. If data is sparse (under 3 months or under 5 transactions), return 1-2 but still prioritize TIME.
- Title must be data-specific ("Office Dominates at ₱106k" not "Expense Breakdown").
- Insight must reference specific numbers, percentages, or category names.
- Max 120 characters per insight.`

// ── AI call ───────────────────────────────────────────────────────────────────

async function callAI(prompt: string, systemPrompt: string): Promise<string> {
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
        system: systemPrompt,
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
          { role: "system", content: systemPrompt },
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

  const { user_id, existing_widget_types, plotted_advanced_types } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const isRDUser = RD_USER_ID && user_id === RD_USER_ID

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // ── 1. Fetch user files ─────────────────────────────────────────────────
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

    // ── 2. Fetch document fields ────────────────────────────────────────────
    const selectFields = isRDUser
      ? "file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, tax_amount, discount_amount, payment_method, period_start, period_end, counterparty_name"
      : "file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, tax_amount"

    const { data: fields } = await supabase
      .from("document_fields")
      .select(selectFields)
      .in("file_id", fileIds)

    const f = fields ?? []
    const currency = f.find((x: any) => x.currency)?.currency ?? "PHP"
    const symbol   = currency === "PHP" ? "₱" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"

    // ── 3. Core aggregations ────────────────────────────────────────────────
    const totalIncome   = f.filter((x: any) => x.gross_income != null).reduce((s: number, x: any) => s + Number(x.gross_income), 0)
    const totalExpenses = f.filter((x: any) => x.total_amount != null && x.gross_income == null).reduce((s: number, x: any) => s + Number(x.total_amount), 0)
    const netPosition   = totalIncome - totalExpenses
    const savingsRate   = totalIncome > 0 ? ((netPosition / totalIncome) * 100).toFixed(1) : "0"
    const totalTax      = f.filter((x: any) => x.tax_amount != null).reduce((s: number, x: any) => s + Number(x.tax_amount), 0)

    const categories: Record<string, number> = {}
    for (const x of f) {
      if (x.expense_category && x.total_amount != null && x.gross_income == null) {
        categories[x.expense_category] = (categories[x.expense_category] ?? 0) + Number(x.total_amount)
      }
    }
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]
    const employers   = [...new Set(f.filter((x: any) => x.employer_name).map((x: any) => x.employer_name))]
    const dateRange   = f.filter((x: any) => x.document_date).map((x: any) => x.document_date).sort()
    const months      = [...new Set(dateRange.map((d: string) => d.slice(0, 7)))].length

    const monthlyExpenses: Record<string, number> = {}
    const monthlyIncomeMap: Record<string, number> = {}
    for (const x of f) {
      if (!x.document_date) continue
      const mo = x.document_date.slice(0, 7)
      if (x.total_amount != null && x.gross_income == null) {
        monthlyExpenses[mo] = (monthlyExpenses[mo] ?? 0) + Number(x.total_amount)
      }
      if (x.gross_income != null) {
        monthlyIncomeMap[mo] = (monthlyIncomeMap[mo] ?? 0) + Number(x.gross_income)
      }
    }
    const sortedMonths = Object.keys({ ...monthlyExpenses, ...monthlyIncomeMap }).sort()

    // ── 4. R&D enrichment aggregations (admin only) ─────────────────────────
    // Computed here as the data foundation for future Sonnet R&D visuals.
    // Not used for widget generation yet — reserved for the R&D analytics layer.
    let profilePayload: any = null

    if (isRDUser) {
      const vendorSpend: Record<string, { total: number; count: number }> = {}
      for (const x of f) {
        if (x.vendor_name && x.total_amount != null && x.gross_income == null) {
          if (!vendorSpend[x.vendor_name]) vendorSpend[x.vendor_name] = { total: 0, count: 0 }
          vendorSpend[x.vendor_name].total += Number(x.total_amount)
          vendorSpend[x.vendor_name].count += 1
        }
      }
      const topVendors = Object.entries(vendorSpend)
        .map(([name, v]) => ({ name, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)

      const paymentMethods: Record<string, number> = {}
      for (const x of f) {
        if (x.payment_method) {
          paymentMethods[x.payment_method] = (paymentMethods[x.payment_method] ?? 0) + 1
        }
      }

      const monthlyDeltas = sortedMonths.map((mo: string, i: number) => {
        const prevMo = sortedMonths[i - 1]
        return {
          month:         mo,
          income_delta:  prevMo != null ? (monthlyIncomeMap[mo] ?? 0) - (monthlyIncomeMap[prevMo] ?? 0) : 0,
          expense_delta: prevMo != null ? (monthlyExpenses[mo] ?? 0) - (monthlyExpenses[prevMo] ?? 0) : 0,
        }
      })

      const discountTotal = f.filter((x: any) => x.discount_amount != null).reduce((s: number, x: any) => s + Number(x.discount_amount), 0)
      const discountEvents = f
        .filter((x: any) => x.discount_amount != null && Number(x.discount_amount) > 0)
        .map((x: any) => ({ vendor: x.vendor_name ?? x.counterparty_name, amount: Number(x.discount_amount), date: x.document_date }))
        .sort((a: any, b: any) => b.amount - a.amount)
        .slice(0, 10)

      const incomeSources = Object.entries(
        f.filter((x: any) => x.employer_name && x.gross_income != null)
          .reduce((acc: Record<string, number>, x: any) => {
            acc[x.employer_name] = (acc[x.employer_name] ?? 0) + Number(x.gross_income)
            return acc
          }, {})
      ).map(([employer, total]) => ({ employer, total })).sort((a: any, b: any) => b.total - a.total)

      const taxByPeriod: Record<string, number> = {}
      for (const x of f) {
        if (x.tax_amount != null && Number(x.tax_amount) > 0) {
          const period = x.period_start?.slice(0, 7) ?? x.document_date?.slice(0, 7) ?? "unknown"
          taxByPeriod[period] = (taxByPeriod[period] ?? 0) + Number(x.tax_amount)
        }
      }
      const taxTimeline = Object.entries(taxByPeriod)
        .map(([period, tax_amount]) => ({ period, tax_amount }))
        .sort((a, b) => a.period.localeCompare(b.period))

      const avgMonthlyIncome   = months > 0 ? totalIncome / months   : 0
      const avgMonthlyExpenses = months > 0 ? totalExpenses / months : 0

      profilePayload = {
        user_id,
        top_vendors:          topVendors,
        payment_methods:      paymentMethods,
        monthly_deltas:       monthlyDeltas,
        discount_total:       discountTotal,
        discount_events:      discountEvents,
        income_sources:       incomeSources,
        tax_timeline:         taxTimeline,
        dominant_category:    topCategory?.[0] ?? null,
        avg_monthly_income:   avgMonthlyIncome,
        avg_monthly_expenses: avgMonthlyExpenses,
        document_count:       userFiles.length,
        months_tracked:       months,
        last_run_at:          new Date().toISOString(),
      }
    }

    // ── 5. Clear all previous suggestions (non-starred) ─────────────────────
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)

    // ── 6. Build Haiku prompt ────────────────────────────────────────────────
    // Dedup against plotted_advanced_types only — not existing_widget_types.
    // Standard dashboard chart types can still be upgraded with AI insight.
    const alreadyPlotted: string[] = plotted_advanced_types ?? []

    const categoryBreakdown = Object.entries(categories)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([k, v]) => `${k}: ${symbol}${(v as number).toLocaleString()}`)
      .join(", ")

    const monthlyBreakdown = sortedMonths
      .map((mo: string) => `${mo}: income ${symbol}${(monthlyIncomeMap[mo] ?? 0).toLocaleString()} / expenses ${symbol}${(monthlyExpenses[mo] ?? 0).toLocaleString()}`)
      .join(" | ")

    const prompt = `Generate enhanced widget configurations for this user's financial data.

already_plotted (DO NOT use these types): [${alreadyPlotted.join(", ")}]

Financial summary:
- Total income: ${symbol}${totalIncome.toLocaleString()} across ${months} month${months !== 1 ? "s" : ""}
- Total expenses: ${symbol}${totalExpenses.toLocaleString()}
- Net position: ${symbol}${netPosition.toLocaleString()}
- Savings rate: ${savingsRate}%
- Tax paid: ${symbol}${totalTax.toLocaleString()}
- Top expense category: ${topCategory ? `${topCategory[0]} at ${symbol}${Math.round(topCategory[1]).toLocaleString()}` : "N/A"}
- Employers / income sources: ${employers.length ? employers.join(", ") : "none detected"}
- Total documents: ${userFiles.length}

Category breakdown: ${categoryBreakdown || "no category data"}

Monthly income vs expenses: ${monthlyBreakdown || "no monthly data"}

Standard dashboard already shows: ${(existing_widget_types ?? []).join(", ")}`

    // ── 7. Call Haiku ────────────────────────────────────────────────────────
    const rawText = await callAI(prompt, UPGRADE_SYSTEM_PROMPT)
    if (!rawText) throw new Error("Empty response from AI")

    let parsed: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON object found in response")
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error(`Failed to parse AI output: ${rawText}`)
    }

    const generatedWidgets = parsed.widgets ?? []
    if (!generatedWidgets.length) {
      return new Response(
        JSON.stringify({ success: true, count: 0, widgets: [], message: "All upgrade chart types already plotted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── 8. Insert advanced_widgets (7-day TTL) ───────────────────────────────
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

    // ── 9. Write-back user analytics profile (R&D only) ─────────────────────
    if (isRDUser && profilePayload) {
      await supabase
        .from("user_analytics_profile")
        .upsert(profilePayload, { onConflict: "user_id" })
    }

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
