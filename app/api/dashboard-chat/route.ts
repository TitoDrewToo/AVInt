import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { computeEntitlement } from "@/lib/entitlement"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildDashboardAIContext } from "@/lib/dashboard-ai-context"
import { fallbackDashboardAssistantResult, validateDashboardAssistantModelResult } from "@/lib/dashboard-assistant"
import { executeDashboardVisual } from "@/lib/dashboard-visual-engine"
import { saveDashboardWidget } from "@/lib/dashboard-widget-store"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { readVirtualModel } from "@/lib/virtual-model"

const SYSTEM_PROMPT = `You are AVIntelligence Dashboard Copilot. Answer questions about the user's governed Smart Storage data and author refreshable dashboard visuals when asked.
Return only JSON. For a question, return {"mode":"answer","answer":"..."}. For a visual request, return {"mode":"visual","answer":"...","proposal":{...}}.
A proposal requires widget_type, title, description, insight, and definition. widget_type and definition.renderer must be the same: line-chart, area-chart, bar-chart, or pie-chart.
Definition requires source, scope, period, filters, dimension, metric, and limit. Sources are {kind:"records",documentTypes?:string[]} or {kind:"dataset",datasetId,dateField?,currencyField?}. Period is {kind:"all"}, {kind:"fixed",from,to}, or {kind:"rolling",unit:"month"|"year",count,offset?}. Filters use field, operator (eq|neq|contains|gt|gte|lt|lte), value. Dimension is {field,grain?:"day"|"month"|"year"}. Metric is {aggregation:"count"|"sum"|"average"|"min"|"max",field?}. Limit is 1-50.
Use only supplied fields and dataset IDs. Never invent amounts, records, trends, causes, fields, or computed rows. Prefer line/area for time, bar for comparison, and pie only for a small composition. Never combine currencies; execution will keep monetary currency buckets separate. Do not provide tax or legal advice. Keep the answer concise and state limitations plainly.`

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", auth.user.id)
      .maybeSingle()
    if (subscriptionError) throw new Error(subscriptionError.message)
    if (!computeEntitlement(subscription).isActive) {
      return NextResponse.json({ error: "Active premium access required" }, { status: 403 })
    }
    if (!(await checkRateLimit("chat", `dashboard:${auth.user.id}`, 60, 15))) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    if (body.action === "save") {
      const pageSlug = typeof body.pageSlug === "string" && /^[a-z0-9-]{1,80}$/.test(body.pageSlug) ? body.pageSlug : "personal"
      const saved = await saveDashboardWidget(auth.user.id, body.proposal, true, pageSlug)
      return NextResponse.json({ saved })
    }

    const question = typeof body.question === "string" ? body.question.trim().slice(0, 600) : ""
    if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 })
    const isoDate = /^\d{4}-\d{2}-\d{2}$/
    const activePage = typeof body.pageSlug === "string" && /^[a-z0-9-]{1,80}$/.test(body.pageSlug) ? body.pageSlug : "personal"
    const dateFrom = typeof body.dateFrom === "string" && isoDate.test(body.dateFrom) ? body.dateFrom : null
    const dateTo = typeof body.dateTo === "string" && isoDate.test(body.dateTo) ? body.dateTo : null

    const [context, model] = await Promise.all([
      buildDashboardAIContext(auth.user.id),
      readVirtualModel(auth.user.id, { pageSize: 1 }),
    ])
    const availableModel = {
      recordFields: [...new Set(["occurred_on", "period_start", "period_end", "amount", "amount_base", "currency", "direction", "counterparty", "counterparty_normalized", "category", "description", "document_type", "record_type", "is_recurring", "confidence", "needs_review", ...model.catalog.map((field) => field.field_key)])],
      documentTypes: [...new Set(model.files.map((file) => file.document_type).filter(Boolean))],
      datasets: model.datasets.map((dataset) => ({
        id: dataset.id,
        name: dataset.name,
        row_count: dataset.row_count,
        needs_review: dataset.needs_review,
        columns: model.datasetColumns.filter((column) => column.dataset_id === dataset.id).map((column) => ({ key: column.key, label: column.label, data_type: column.data_type, needs_review: column.needs_review })),
      })),
    }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      const result = fallbackDashboardAssistantResult(question, context.readyRecordCount, context.sourceCount, dateFrom, dateTo)
      const preview = result.proposal ? await executeDashboardVisual(auth.user.id, result.proposal.definition) : null
      return NextResponse.json({ ...result, preview, provider: "local-fallback" })
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_completion_tokens: 1_000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Request:\n${question}\n\nCurrent dashboard page: ${activePage}\nCurrent dashboard date filter: ${dateFrom && dateTo ? `${dateFrom} through ${dateTo}` : "all time"}. Apply it to a proposed visual unless the request explicitly asks for another period.\n\nAccount summary:\n${JSON.stringify(context)}\n\nAvailable virtual data model:\n${JSON.stringify(availableModel)}` },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Dashboard assistant provider failed (${response.status})`)
    const payload = await response.json()
    const raw = payload.choices?.[0]?.message?.content
    const result = validateDashboardAssistantModelResult(typeof raw === "string" ? JSON.parse(raw) : null)
    if (!result) return NextResponse.json({ error: "The assistant returned an invalid dashboard response" }, { status: 422 })
    const preview = result.proposal ? await executeDashboardVisual(auth.user.id, result.proposal.definition) : null
    return NextResponse.json({ ...result, preview, provider: "openai" })
  } catch (error) {
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error, { route: "dashboard-chat", stage: "unhandled" })
  }
}
