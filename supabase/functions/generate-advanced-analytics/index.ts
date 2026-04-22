import { createClient, serve } from "../_shared/deps.ts"
import {
  buildAdvancedAnalyticsSystemPrompt,
  getEnabledAnalyticsWidgetTypes,
} from "../../../lib/advanced-analytics-config.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"

const ANTHROPIC_API_KEY         = Deno.env.get("ANTHROPIC_API_KEY")!
const OPENAI_API_KEY            = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!
const ANALYTICS_PROVIDERS       = providerChain("ADVANCED_ANALYTICS", "anthropic", "openai", ["ANALYTICS_PROVIDER"])
// R&D gate — set this env var to your Supabase user UUID to unlock advanced features
const RD_USER_ID                = Deno.env.get("RD_USER_ID") ?? ""

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

const ADVANCED_SYSTEM_PROMPT = buildAdvancedAnalyticsSystemPrompt()

// ── AI call ───────────────────────────────────────────────────────────────────

async function callAIProvider(provider: AiProvider, prompt: string, systemPrompt: string): Promise<string> {
  if (provider === "anthropic") {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
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
  }
  if (provider === "openai") {
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
  throw new Error(`Unsupported advanced analytics provider: ${provider}`)
}

async function callAI(prompt: string, systemPrompt: string): Promise<{ rawText: string; provider: AiProvider }> {
  let lastError: unknown = null
  for (const provider of ANALYTICS_PROVIDERS) {
    try {
      const rawText = await callAIProvider(provider, prompt, systemPrompt)
      if (!rawText) throw new Error(`Empty response from ${provider}`)
      return { rawText, provider }
    } catch (error) {
      lastError = error
      console.error(`advanced analytics provider ${provider} failed:`, error instanceof Error ? error.message : String(error))
      if (!isProviderFailure(error)) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All advanced analytics providers failed")
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

  const { user_id, existing_widget_types, plotted_advanced_types } = body
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (!Array.isArray(plotted_advanced_types)) {
    return new Response(JSON.stringify({ error: "plotted_advanced_types required" }), {
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

  const isRDUser = RD_USER_ID && user_id === RD_USER_ID

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

    // Build a map of fileId → document_type for consistent income/expense classification.
    // This matches the dashboard's approach (document_type-based, not field-presence-based).
    const INCOME_TYPES = ["payslip", "income_statement"]
    const EXPENSE_TYPES = ["receipt", "invoice"]
    const fileTypeMap: Record<string, string> = {}
    for (const file of userFiles) fileTypeMap[file.id] = file.document_type

    // ── 2. Fetch document fields ────────────────────────────────────────────
    const selectFields = [
      "file_id",
      "vendor_name",
      "vendor_normalized",
      "employer_name",
      "counterparty_name",
      "document_date",
      "period_start",
      "period_end",
      "currency",
      "jurisdiction",
      "total_amount",
      "gross_income",
      "net_income",
      "tax_amount",
      "discount_amount",
      "expense_category",
      "income_source",
      "payment_method",
    ].join(", ")

    const { data: fields } = await supabase
      .from("document_fields")
      .select(selectFields)
      .in("file_id", fileIds)

    const f = fields ?? []
    const currency = f.find((x: any) => x.currency)?.currency ?? "PHP"
    const symbol   = currency === "PHP" ? "₱" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$"

    // ── 3. Core aggregations — csv_export rows classified by gross_income presence ─
    const isIncomeRow  = (x: any) => {
      const dt = fileTypeMap[x.file_id]
      return dt === "csv_export" ? x.gross_income != null : INCOME_TYPES.includes(dt)
    }
    const isExpenseRow = (x: any) => {
      const dt = fileTypeMap[x.file_id]
      return dt === "csv_export" ? (x.gross_income == null && x.total_amount != null) : EXPENSE_TYPES.includes(dt)
    }
    const incomeRows  = f.filter(isIncomeRow)
    const expenseRows = f.filter(isExpenseRow)

    const totalIncome   = incomeRows.reduce((s: number, x: any) => s + Number(x.gross_income ?? x.total_amount ?? 0), 0)
    const totalExpenses = expenseRows.reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0)
    const netPosition   = totalIncome - totalExpenses
    const savingsRate   = totalIncome > 0 ? ((netPosition / totalIncome) * 100).toFixed(1) : "0"
    const totalTax      = f.filter((x: any) => x.tax_amount != null).reduce((s: number, x: any) => s + Number(x.tax_amount), 0)

    const categories: Record<string, number> = {}
    for (const x of expenseRows) {
      if (x.expense_category && x.total_amount != null) {
        categories[x.expense_category] = (categories[x.expense_category] ?? 0) + Number(x.total_amount)
      }
    }
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]
    const employers   = [...new Set(incomeRows.filter((x: any) => x.employer_name).map((x: any) => x.employer_name))]
    const dateRange   = f.filter((x: any) => x.document_date).map((x: any) => x.document_date).sort()
    const months      = [...new Set(dateRange.map((d: string) => d.slice(0, 7)))].length
    const transactionCount = f.filter((x: any) => x.total_amount != null || x.gross_income != null).length

    const vendorSpend: Record<string, { total: number; count: number }> = {}
    for (const x of expenseRows) {
      const vendorKey = x.vendor_normalized ?? x.vendor_name
      if (vendorKey && x.total_amount != null) {
        if (!vendorSpend[vendorKey]) vendorSpend[vendorKey] = { total: 0, count: 0 }
        vendorSpend[vendorKey].total += Number(x.total_amount)
        vendorSpend[vendorKey].count += 1
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

    const incomeSourceTotals: Record<string, number> = {}
    for (const x of incomeRows) {
      const key = x.income_source ?? "unknown"
      incomeSourceTotals[key] = (incomeSourceTotals[key] ?? 0) + Number(x.gross_income ?? x.total_amount ?? 0)
    }

    const jurisdictionTotals: Record<string, number> = {}
    for (const x of f) {
      if (!x.jurisdiction) continue
      jurisdictionTotals[x.jurisdiction] = (jurisdictionTotals[x.jurisdiction] ?? 0) + Number(x.total_amount ?? x.gross_income ?? 0)
    }

    const monthlyExpenses: Record<string, number> = {}
    const monthlyIncomeMap: Record<string, number> = {}
    for (const x of f) {
      if (!x.document_date) continue
      const mo = x.document_date.slice(0, 7)
      if (isIncomeRow(x))
        monthlyIncomeMap[mo] = (monthlyIncomeMap[mo] ?? 0) + Number(x.gross_income ?? x.total_amount ?? 0)
      else if (isExpenseRow(x))
        monthlyExpenses[mo] = (monthlyExpenses[mo] ?? 0) + Number(x.total_amount ?? 0)
    }
    const sortedMonths = Object.keys({ ...monthlyExpenses, ...monthlyIncomeMap }).sort()
    const monthlyNet = sortedMonths.map((mo: string) => ({
      month: mo,
      income: monthlyIncomeMap[mo] ?? 0,
      expenses: monthlyExpenses[mo] ?? 0,
      net: (monthlyIncomeMap[mo] ?? 0) - (monthlyExpenses[mo] ?? 0),
    }))

    const documentTypeBreakdown = Object.entries(
      userFiles.reduce((acc: Record<string, number>, file: any) => {
        acc[file.document_type] = (acc[file.document_type] ?? 0) + 1
        return acc
      }, {}),
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

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

    // ── 4. R&D enrichment aggregations (admin only) ─────────────────────────
    // Computed here as the data foundation for future Sonnet R&D visuals.
    // Not used for widget generation yet — reserved for the R&D analytics layer.
    let profilePayload: any = null

    if (isRDUser) {
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

    // ── 5. Clear previous spec-level suggestions (non-starred, non-rd) ──────
    //     R&D widgets (widget_type = 'rd-insight') are managed by the Sonnet
    //     function and must not be wiped here, or a parallel R&D run would
    //     race with this delete.
    await supabase
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user_id)
      .eq("is_starred", false)
      .neq("widget_type", "rd-insight")

    // ── 6. Build Haiku prompt ────────────────────────────────────────────────
    // Dedup against plotted_advanced_types only — not existing_widget_types.
    // Standard dashboard chart types can still be upgraded with AI insight.
    const alreadyPlotted: string[] = plotted_advanced_types.filter(Boolean)

    const categoryBreakdown = Object.entries(categories)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([k, v]) => `${k}: ${symbol}${(v as number).toLocaleString()}`)
      .join(", ")

    const monthlyBreakdown = sortedMonths
      .map((mo: string) => `${mo}: income ${symbol}${(monthlyIncomeMap[mo] ?? 0).toLocaleString()} / expenses ${symbol}${(monthlyExpenses[mo] ?? 0).toLocaleString()}`)
      .join(" | ")

    const vendorBreakdown = topVendors
      .map((vendor) => `${vendor.name}: ${symbol}${vendor.total.toLocaleString()} across ${vendor.count} docs`)
      .join(", ")

    const incomeSourceBreakdown = Object.entries(incomeSourceTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([source, total]) => `${source}: ${symbol}${total.toLocaleString()}`)
      .join(", ")

    const paymentMethodBreakdown = Object.entries(paymentMethods)
      .sort((a, b) => b[1] - a[1])
      .map(([method, count]) => `${method}: ${count}`)
      .join(", ")

    const jurisdictionBreakdown = Object.entries(jurisdictionTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([jurisdiction, total]) => `${jurisdiction}: ${symbol}${total.toLocaleString()}`)
      .join(", ")

    const documentTypeSummary = documentTypeBreakdown
      .map((item) => `${item.name}: ${item.value}`)
      .join(", ")

    const monthlyNetSummary = monthlyNet
      .map((item) => `${item.month}: net ${symbol}${item.net.toLocaleString()}`)
      .join(" | ")

    const taxTimelineSummary = taxTimeline
      .map((item) => `${item.period}: ${symbol}${item.tax_amount.toLocaleString()}`)
      .join(" | ")

    const prompt = `Generate advanced widget configurations for this user's financial data.

Allowed widget types: [${getEnabledAnalyticsWidgetTypes().join(", ")}]
already_plotted (DO NOT use these widget types): [${alreadyPlotted.join(", ")}]
standard_dashboard_widget_types: [${(existing_widget_types ?? []).join(", ")}]

Data sufficiency:
- months_tracked: ${months}
- transaction_count: ${transactionCount}
- distinct_categories: ${Object.keys(categories).length}
- distinct_vendors: ${topVendors.length}

Financial summary:
- total_income: ${symbol}${totalIncome.toLocaleString()}
- total_expenses: ${symbol}${totalExpenses.toLocaleString()}
- net_position: ${symbol}${netPosition.toLocaleString()}
- savings_rate: ${savingsRate}%
- tax_paid: ${symbol}${totalTax.toLocaleString()}
- top_expense_category: ${topCategory ? `${topCategory[0]} at ${symbol}${Math.round(topCategory[1]).toLocaleString()}` : "N/A"}
- employers_or_income_sources: ${employers.length ? employers.join(", ") : "none detected"}
- total_documents: ${userFiles.length}

Category breakdown:
${categoryBreakdown || "no category data"}

Vendor concentration:
${vendorBreakdown || "no vendor concentration data"}

Income source breakdown:
${incomeSourceBreakdown || "no income source data"}

Payment methods:
${paymentMethodBreakdown || "no payment method data"}

Jurisdiction mix:
${jurisdictionBreakdown || "no jurisdiction data"}

Document type distribution:
${documentTypeSummary || "no document type data"}

Monthly income vs expenses:
${monthlyBreakdown || "no monthly data"}

Monthly net position:
${monthlyNetSummary || "no monthly net data"}

Tax timeline:
${taxTimelineSummary || "no tax timeline data"}`

    // ── 7. Call Haiku ────────────────────────────────────────────────────────
    const { rawText } = await callAI(prompt, ADVANCED_SYSTEM_PROMPT)
    if (!rawText) throw new Error("Empty response from AI")

    let parsed: any
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error("No JSON object found in response")
      parsed = JSON.parse(jsonMatch[0])
    } catch {
      throw new Error(`Failed to parse AI output: ${rawText}`)
    }

    const allowedWidgetTypes = new Set(getEnabledAnalyticsWidgetTypes())
    const generatedWidgets = (parsed.widgets ?? [])
      .filter((widget: any) => allowedWidgetTypes.has(widget.widget_type))
      .filter((widget: any, index: number, arr: any[]) =>
        index === arr.findIndex((other) =>
          other.widget_type === widget.widget_type ||
          (other.chart_family === widget.chart_family && other.title === widget.title),
        ),
      )
      .slice(0, 3)
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
    console.error("generate-advanced-analytics error:", error instanceof Error ? error.message : String(error))
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
