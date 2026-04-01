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

You receive a rich financial data summary. Generate exactly 4 widget configurations that surface the most valuable insights.

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
Standard (use only if no advanced type fits):
- "bar-chart"        — monthly income vs expenses bar comparison
- "line-chart"       — income/expense trend over time
- "area-chart"       — cumulative income/expense area
- "pie-chart"        — expense category breakdown

Advanced (MANDATORY — you MUST include at least 2 of these if data supports them):
- "vendor-ranking"   — top vendors by cumulative spend (horizontal bar) — requires 3+ vendors
- "payment-split"    — payment method distribution (donut/pie) — requires 2+ payment methods
- "monthly-delta"    — month-over-month expense change (bar) — requires 2+ months
- "income-waterfall" — gross income → deductions → net income (stacked bar) — requires gross_income data
- "tax-timeline"     — tax paid per period (bar/line) — requires 2+ tax periods

DIMENSION RULE — each widget must cover a DIFFERENT dimension. Assign one widget per dimension:
  TIME        → ONLY ONE OF: monthly-delta, tax-timeline, line-chart, area-chart
  COMPOSITION → ONLY ONE OF: payment-split, pie-chart
  RANKING     → ONLY ONE OF: vendor-ranking, bar-chart
  FLOW        → income-waterfall only

You may use at most 1 widget per dimension. Never use line-chart AND area-chart together — they are the same dimension.

Other rules:
- HARD RULE: never output a widget_type that appears in the existing dashboard list.
- The insight MUST reference specific numbers, vendor names, or percentages from the data.
- Title must be data-specific ("GrabFood Leads at ₱12,400" not "Top Vendors").
- Keep insight to 1 sentence, max 140 characters.
- If a dimension has no suitable data, skip it rather than forcing a poor fit.`

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

  const { user_id, existing_widget_types, plotted_advanced_types } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // R&D gate — advanced features only for admin user
  const isRDUser = RD_USER_ID && user_id === RD_USER_ID

  // ── Dimension pre-selection ───────────────────────────────────────────────
  // Code picks the widget types — AI only writes content for them.
  // This prevents Haiku from defaulting to familiar standard chart types.
  const DIMENSION_MAP: Record<string, string[]> = {
    TIME:        ["monthly-delta", "tax-timeline", "line-chart", "area-chart"],
    COMPOSITION: ["payment-split", "pie-chart"],
    RANKING:     ["vendor-ranking", "bar-chart"],
    FLOW:        ["income-waterfall"],
  }
  const PREFERRED: Record<string, string> = {
    TIME:        "monthly-delta",
    COMPOSITION: "payment-split",
    RANKING:     "vendor-ranking",
    FLOW:        "income-waterfall",
  }
  const FALLBACK: Record<string, string | null> = {
    TIME:        "area-chart",
    COMPOSITION: "pie-chart",
    RANKING:     "bar-chart",
    FLOW:        null,
  }

  const allCovered = [
    ...(existing_widget_types ?? []),
    ...(plotted_advanced_types ?? []),
  ]

  const coveredDimensions = new Set<string>()
  for (const [dim, types] of Object.entries(DIMENSION_MAP)) {
    if (allCovered.some((t: string) => types.includes(t))) coveredDimensions.add(dim)
  }

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

    // Monthly breakdowns — computed for all users (needed for correlations + standard chart context)
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

    // ── 4. R&D enrichment aggregations ──────────────────────────────────────
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

      // Monthly deltas — uses hoisted monthlyExpenses/monthlyIncomeMap/sortedMonths
      const monthlyDeltas = sortedMonths.map((mo: string, i: number) => {
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

    }

    // ── 5. Clear all previous suggestions (non-starred) ─────────────────────
    // On regeneration, replace everything — starred widgets are preserved
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)

    // ── 6. Pre-select target widget types + build targeted context ───────────
    // Determine data sufficiency per advanced type
    const vendorCount   = isRDUser ? Object.keys(
      f.filter((x: any) => x.vendor_name && x.total_amount != null && x.gross_income == null)
       .reduce((a: any, x: any) => { a[x.vendor_name] = 1; return a }, {})
    ).length : 0
    const paymentMethodCount = isRDUser ? Object.keys(
      f.filter((x: any) => x.payment_method)
       .reduce((a: any, x: any) => { a[x.payment_method] = 1; return a }, {})
    ).length : 0
    const taxPeriodCount = isRDUser && profilePayload
      ? profilePayload.tax_timeline.length : 0

    const canUse = (type: string): boolean => {
      if (type === "vendor-ranking")   return isRDUser && vendorCount >= 3
      if (type === "payment-split")    return isRDUser && paymentMethodCount >= 2
      if (type === "monthly-delta")    return months >= 2
      if (type === "income-waterfall") return isRDUser && totalIncome > 0
      if (type === "tax-timeline")     return isRDUser && taxPeriodCount >= 2
      return true // standard types always available
    }

    // Pick one type per uncovered dimension
    const targetTypes: string[] = []
    for (const dim of ["TIME", "COMPOSITION", "RANKING", "FLOW"]) {
      if (coveredDimensions.has(dim)) continue
      const preferred = PREFERRED[dim]
      const fallback  = FALLBACK[dim]
      if (canUse(preferred))      targetTypes.push(preferred)
      else if (fallback && canUse(fallback)) targetTypes.push(fallback)
    }

    if (!targetTypes.length) {
      return new Response(JSON.stringify({ success: true, count: 0, widgets: [],
        message: "All dimensions already covered by existing widgets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // Build per-type data snippets so AI has exactly what it needs per widget
    const typeContexts: string[] = []
    for (const type of targetTypes) {
      if (type === "monthly-delta" && isRDUser && profilePayload) {
        const deltas = profilePayload.monthly_deltas.slice(-4)
        typeContexts.push(`monthly-delta data: ${deltas.map((d: any) =>
          `${d.month}: expense_delta ${d.expense_delta >= 0 ? "+" : ""}${symbol}${Math.round(d.expense_delta).toLocaleString()}, income_delta ${d.income_delta >= 0 ? "+" : ""}${symbol}${Math.round(d.income_delta).toLocaleString()}`
        ).join(" | ")}`)
      } else if (type === "area-chart" || type === "line-chart") {
        const byMonth = sortedMonths.map((mo: string) => `${mo}: income ${symbol}${(monthlyIncomeMap[mo]||0).toLocaleString()} / expenses ${symbol}${(monthlyExpenses[mo]||0).toLocaleString()}`)
        typeContexts.push(`${type} data (monthly): ${byMonth.join(" | ")}`)
      } else if (type === "vendor-ranking" && isRDUser && profilePayload) {
        typeContexts.push(`vendor-ranking data: ${profilePayload.top_vendors.slice(0,6).map((v: any) => `${v.name}: ${symbol}${Math.round(v.total).toLocaleString()} (${v.count} txns)`).join(", ")}`)
      } else if (type === "payment-split" && isRDUser && profilePayload) {
        typeContexts.push(`payment-split data: ${Object.entries(profilePayload.payment_methods).map(([m,c]) => `${m}: ${c} transactions`).join(", ")}`)
      } else if (type === "income-waterfall" && isRDUser) {
        const deductions = totalTax + totalIncome * 0.02
        typeContexts.push(`income-waterfall data: gross ${symbol}${totalIncome.toLocaleString()} → tax ${symbol}${totalTax.toLocaleString()} → SSS/PhilHealth est ${symbol}${Math.round(totalIncome*0.02).toLocaleString()} → net ${symbol}${Math.round(totalIncome-deductions).toLocaleString()}`)
      } else if (type === "tax-timeline" && isRDUser && profilePayload) {
        typeContexts.push(`tax-timeline data: ${profilePayload.tax_timeline.map((t: any) => `${t.period}: ${symbol}${Math.round(t.tax_amount).toLocaleString()}`).join(", ")}`)
      } else if (type === "pie-chart" || type === "bar-chart") {
        typeContexts.push(`${type} data: ${Object.entries(categories).sort((a,b) => (b[1] as number)-(a[1] as number)).map(([k,v]) => `${k}: ${symbol}${(v as number).toLocaleString()}`).join(", ")}`)
      }
    }

    // Compute cross-document correlations for insight enrichment
    const monthlySavingsRates = sortedMonths.map((mo: string) => {
      const inc = monthlyIncomeMap[mo] ?? 0
      const exp = monthlyExpenses[mo] ?? 0
      const rate = inc > 0 ? ((inc - exp) / inc * 100) : null
      return { month: mo, income: inc, expenses: exp, rate }
    }).filter((m: any) => m.income > 0)
    const bestMonth = monthlySavingsRates.length
      ? monthlySavingsRates.reduce((best: any, m: any) => (m.rate ?? -Infinity) > (best.rate ?? -Infinity) ? m : best)
      : null
    const latestMonth = monthlySavingsRates[monthlySavingsRates.length - 1]

    const correlationContext = [
      bestMonth ? `Best savings month: ${bestMonth.month} at ${bestMonth.rate?.toFixed(1)}% (income ${symbol}${bestMonth.income.toLocaleString()}, expenses ${symbol}${bestMonth.expenses.toLocaleString()})` : null,
      latestMonth && bestMonth && latestMonth.month !== bestMonth.month
        ? `Latest month (${latestMonth.month}): ${symbol}${latestMonth.income.toLocaleString()} income, ${symbol}${latestMonth.expenses.toLocaleString()} expenses, ${latestMonth.rate?.toFixed(1)}% savings`
        : null,
      employers.length > 1 ? `Multiple income sources: ${employers.join(", ")}` : null,
    ].filter(Boolean).join("\n")

    const prompt = `You are filling in widget metadata. The widget types are ALREADY DECIDED — do not change them.

Generate title, description, and insight for EXACTLY these widget types:
${targetTypes.map((t, i) => `${i+1}. ${t}`).join("\n")}

Return ONLY valid JSON — no markdown:
{
  "widgets": [
    { "widget_type": "<exact type from list>", "title": "<data-specific title>", "description": "<one-line subtitle>", "insight": "<1 sentence with specific numbers>" }
  ]
}

Per-widget data:
${typeContexts.join("\n")}

Cross-document correlations:
${correlationContext || "insufficient data for correlations"}

Rules:
- widget_type MUST exactly match the types listed above — no substitutions
- Title must reference actual values ("GrabFood Leads at ${symbol}12,400" not "Top Vendors")
- Insight must cite specific numbers or percentages from the data above
- Max 140 characters per insight`

    // ── 7. Call AI ───────────────────────────────────────────────────────────
    const systemPrompt = isRDUser ? RD_SYSTEM_PROMPT : STANDARD_SYSTEM_PROMPT
    const rawText = await callAI(prompt, systemPrompt)
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
