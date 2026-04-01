import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const AI_PROVIDER               = Deno.env.get("ANALYTICS_PROVIDER") ?? Deno.env.get("AI_PROVIDER") ?? "anthropic"
// R&D gate — set this env var to your Supabase user UUID to unlock advanced widget types
const RD_USER_ID                = Deno.env.get("RD_USER_ID") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// ── Standard prompt (all users) ───────────────────────────────────────────────

const STANDARD_SYSTEM_PROMPT = `You are a financial analytics AI that generates dashboard widget configurations.

You receive a user's financial data summary and a list of widget types already on their dashboard. Generate exactly 2-3 widget configurations — prioritize quality and insight over quantity.

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
- "bar-chart"   — monthly income vs expenses bar comparison
- "line-chart"  — income/expense trend over time
- "area-chart"  — cumulative income/expense area
- "pie-chart"   — expense category breakdown

Rules:
- You MUST use ONLY chart types above. KPI widgets are forbidden — they are already covered by the standard dashboard.
- HARD RULE: never output a widget_type that appears in the existing dashboard list. If all 4 chart types are already used, return {"widgets": []}.
- DIMENSION RULE: each widget must cover a different data dimension. No two widgets may share the same dimension:
    TIME        → trends, changes over months
    COMPOSITION → breakdowns, distributions, shares
    COMPARISON  → rankings, category vs category
    FLOW        → income to net, waterfall
- The insight MUST reference specific numbers, percentages, or category names from the data.
- Title should be specific to this user's data ("Office Dominates Spending" not "Spending Breakdown").
- Keep insight to 1 sentence, max 120 characters.
- Maximum 3 widgets. If data is sparse (under 3 months or under 5 transactions), return only 1-2.`

// ── R&D prompt (admin user only) ─────────────────────────────────────────────

const RD_SYSTEM_PROMPT = `You are a financial analytics AI that generates dashboard widget configurations.

You receive a rich financial data summary. Generate 3-5 widget configurations that surface the most valuable insights.

Return ONLY a valid JSON object — no markdown, no explanation:
{
  "widgets": [
    {
      "widget_type": "<type>",
      "title": "<specific, data-driven title>",
      "description": "<one-line subtitle>",
      "insight": "<one sentence AI insight referencing actual numbers or names>"
    }
  ]
}

Available widget_type values:
Standard:
- "bar-chart"        — monthly income vs expenses bar comparison
- "line-chart"       — income/expense trend over time
- "area-chart"       — cumulative income/expense area
- "pie-chart"        — expense category breakdown

Advanced (prefer these if data supports them):
- "vendor-ranking"   — top vendors by cumulative spend (horizontal bar)
- "payment-split"    — payment method distribution (donut/pie)
- "monthly-delta"    — month-over-month expense change (bar)
- "income-waterfall" — gross income → deductions → net income (stacked bar)
- "tax-timeline"     — tax paid per period (bar/line)

Rules:
- Prioritize advanced widget types — they reveal deeper patterns.
- HARD RULE: never output a widget_type that appears in the existing dashboard list.
- DIMENSION RULE: each widget must cover a strictly different data dimension. No two widgets may share the same dimension:
    TIME        → monthly-delta, tax-timeline, line-chart, area-chart (trends over months)
    COMPOSITION → payment-split, pie-chart (distributions and shares)
    RANKING     → vendor-ranking, bar-chart (who/what is biggest)
    FLOW        → income-waterfall (gross → deductions → net)
  If you have already assigned a dimension, you MUST pick a different dimension for the next widget.
- Advanced types require sufficient data: vendor-ranking needs 3+ vendors, payment-split needs 2+ payment methods, tax-timeline needs 2+ tax periods.
- The insight MUST reference specific numbers, vendor names, or percentages from the data.
- Title must be data-specific ("GrabFood Leads Dining at ₱12,400" not "Top Vendors").
- Keep insight to 1 sentence, max 140 characters.
- Return 3-5 widgets. If data is sparse (under 3 months), return 2-3.`

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
        max_tokens: 1536,
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
        max_tokens: 1536,
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

  const { user_id, existing_widget_types } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // R&D gate — advanced features only for admin user
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

    // ── 2. Fetch document fields — richer query for R&D users ───────────────
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

    // ── 3. Core aggregations (all users) ────────────────────────────────────
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
    const employers   = [...new Set(f.filter((x: any) => x.employer_name).map((x: any) => x.employer_name))]
    const dateRange   = f.filter((x: any) => x.document_date).map((x: any) => x.document_date).sort()
    const months      = [...new Set(dateRange.map((d: string) => d.slice(0, 7)))].length

    // ── 4. R&D enrichment aggregations ──────────────────────────────────────
    let rdContext = ""
    let profilePayload: any = null

    if (isRDUser) {
      // Vendor ranking
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

      // Payment method distribution
      const paymentMethods: Record<string, number> = {}
      for (const x of f) {
        if (x.payment_method) {
          paymentMethods[x.payment_method] = (paymentMethods[x.payment_method] ?? 0) + 1
        }
      }

      // Monthly deltas (month-over-month expense change)
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
      const monthlyDeltas = sortedMonths.map((mo, i) => {
        const prevMo = sortedMonths[i - 1]
        const expDelta = prevMo != null
          ? (monthlyExpenses[mo] ?? 0) - (monthlyExpenses[prevMo] ?? 0)
          : 0
        const incDelta = prevMo != null
          ? (monthlyIncomeMap[mo] ?? 0) - (monthlyIncomeMap[prevMo] ?? 0)
          : 0
        return { month: mo, income_delta: incDelta, expense_delta: expDelta }
      })

      // Discount total
      const discountTotal = f.filter((x: any) => x.discount_amount != null).reduce((s: number, x: any) => s + Number(x.discount_amount), 0)
      const discountEvents = f
        .filter((x: any) => x.discount_amount != null && Number(x.discount_amount) > 0)
        .map((x: any) => ({ vendor: x.vendor_name ?? x.counterparty_name, amount: Number(x.discount_amount), date: x.document_date }))
        .sort((a: any, b: any) => b.amount - a.amount)
        .slice(0, 10)

      // Income sources
      const incomeSources = Object.entries(
        f.filter((x: any) => x.employer_name && x.gross_income != null)
          .reduce((acc: Record<string, number>, x: any) => {
            acc[x.employer_name] = (acc[x.employer_name] ?? 0) + Number(x.gross_income)
            return acc
          }, {})
      ).map(([employer, total]) => ({ employer, total })).sort((a: any, b: any) => b.total - a.total)

      // Tax timeline (by period)
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

      // Income waterfall components
      const totalDeductions = totalTax + (totalIncome > 0 ? totalIncome * 0.02 : 0) // SSS/PhilHealth est
      const netAfterDeductions = totalIncome - totalDeductions

      // Avg monthly
      const avgMonthlyIncome   = months > 0 ? totalIncome / months   : 0
      const avgMonthlyExpenses = months > 0 ? totalExpenses / months : 0

      // Build profile payload for write-back
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

      // Build R&D context string for prompt
      rdContext = `
Vendor data:
- Top vendors by spend: ${topVendors.slice(0, 5).map(v => `${v.name} (${symbol}${v.total.toLocaleString()}, ${v.count} txns)`).join(", ") || "none"}
- Total unique vendors: ${topVendors.length}

Payment methods: ${Object.entries(paymentMethods).map(([m, c]) => `${m}: ${c}`).join(", ") || "none"}

Month-over-month (last 3 months):
${monthlyDeltas.slice(-3).map(d => `  ${d.month}: expenses ${d.expense_delta >= 0 ? "+" : ""}${symbol}${d.expense_delta.toLocaleString()}, income ${d.income_delta >= 0 ? "+" : ""}${symbol}${d.income_delta.toLocaleString()}`).join("\n") || "  insufficient data"}

Income waterfall:
- Gross income: ${symbol}${totalIncome.toLocaleString()}
- Estimated deductions (tax + SSS/PhilHealth): ${symbol}${totalDeductions.toLocaleString()}
- Net after deductions: ${symbol}${netAfterDeductions.toLocaleString()}

Discounts captured: ${symbol}${discountTotal.toLocaleString()} across ${discountEvents.length} events${discountEvents.length > 0 ? ` (top: ${discountEvents[0].vendor} ${symbol}${discountEvents[0].amount.toLocaleString()})` : ""}

Tax timeline: ${taxTimeline.map(t => `${t.period}: ${symbol}${t.tax_amount.toLocaleString()}`).join(", ") || "none"}

Income sources: ${incomeSources.map(s => `${s.employer} (${symbol}${(s.total as number).toLocaleString()})`).join(", ") || "none"}`
    }

    // ── 5. Expire stale ephemeral widgets ────────────────────────────────────
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)
      .eq("is_plotted", false)
      .lt("expires_at", new Date().toISOString())

    // ── 6. Build prompt ──────────────────────────────────────────────────────
    const existingList = (existing_widget_types ?? []).join(", ") || "none"
    const prompt = `Existing dashboard widget types (DO NOT generate these): ${existingList}

Financial data for analysis:

Currency: ${currency}
Documents: ${userFiles.length} files (${[...new Set(userFiles.map((f: any) => f.document_type))].join(", ")})
Date range: ${dateRange[0] ?? "unknown"} to ${dateRange[dateRange.length - 1] ?? "unknown"} (${months} months)

Income:
- Total gross income: ${symbol}${totalIncome.toLocaleString()}
- Net position: ${symbol}${netPosition.toLocaleString()}
- Savings rate: ${savingsRate}%
- Employers: ${employers.join(", ") || "none"}

Expenses:
- Total expenses: ${symbol}${totalExpenses.toLocaleString()}
- Top category: ${topCategory ? `${topCategory[0]} (${symbol}${topCategory[1].toLocaleString()})` : "none"}
- All categories: ${Object.entries(categories).map(([k, v]) => `${k}: ${symbol}${v.toLocaleString()}`).join(", ") || "none"}

Tax:
- Total tax paid: ${symbol}${totalTax.toLocaleString()}
- Tax rate: ${taxRate}%
${rdContext}`

    // ── 7. Call AI ───────────────────────────────────────────────────────────
    const systemPrompt = isRDUser ? RD_SYSTEM_PROMPT : STANDARD_SYSTEM_PROMPT
    const rawText = await callAI(prompt, systemPrompt)
    if (!rawText) throw new Error("Empty response from AI")

    let parsed: any
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, "").trim())
    } catch {
      throw new Error(`Failed to parse AI output: ${rawText}`)
    }

    const generatedWidgets = parsed.widgets ?? []
    if (!generatedWidgets.length) throw new Error("AI returned no widgets")

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
      // Non-fatal — log but don't fail the response
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
