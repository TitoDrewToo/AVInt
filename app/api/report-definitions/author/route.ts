import { NextRequest, NextResponse } from "next/server"

import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { serverError } from "@/lib/api-error"
import { validateReportDefinitionPayload } from "@/lib/report-definitions"
import { readVirtualModel } from "@/lib/virtual-model"

const SYSTEM_PROMPT = `You design refreshable AVIntelligence Smart Storage reports.
Return only JSON with a top-level "definition" object. Never return SQL, HTML, code, formulas, or computed rows.
The definition must contain: title, description, source, scope, period, filters, blocks, theme.
Sources: {kind:"records", documentTypes?:string[]} or {kind:"dataset", datasetId, dateField?, currencyField?}.
Period: {kind:"all"}, {kind:"fixed",from:"YYYY-MM-DD",to:"YYYY-MM-DD"}, or {kind:"rolling",unit:"month"|"year",count:number,offset?:number}.
Filters use field, operator (eq|neq|contains|gt|gte|lt|lte), value.
Blocks: kpi items use {label,metric:{aggregation,count|sum|average|min|max,field?}}; share uses title,groupBy,metric,limit; table uses title,columns:[{field,label?}],sort?,limit; stat uses title,metric; narrative and note contain static text.
Use only fields and datasets supplied in the data model. Prefer small reports: one KPI block, one useful share when supported, and one bounded table. Do not combine currencies.`

export async function POST(request: NextRequest) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 500) : ""
  if (!prompt) return NextResponse.json({ error: "A report description is required" }, { status: 400 })
  try {
    const model = await readVirtualModel(auth.user.id, { pageSize: 1 })
    const context = {
      recordFields: ["occurred_on", "amount", "currency", "direction", "counterparty", "category", "document_type", "record_type", "is_recurring", "confidence", "needs_review", ...model.catalog.map((field) => field.field_key)],
      documentTypes: [...new Set(model.files.map((file) => file.document_type).filter(Boolean))],
      datasets: model.datasets.map((dataset) => ({ ...dataset, columns: model.datasetColumns.filter((column) => column.dataset_id === dataset.id).map((column) => ({ key: column.key, label: column.label, data_type: column.data_type, needs_review: column.needs_review })) })),
    }
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ proposal: {
        title: prompt.slice(0, 80), description: "Refreshable report over current Smart Storage records.", source: { kind: "records" }, scope: null, period: { kind: "all" }, filters: [],
        blocks: [{ type: "kpi", items: [{ label: "Matching records", metric: { aggregation: "count" } }] }, { type: "table", title: "Record detail", columns: [{ field: "occurred_on", label: "Date" }, { field: "counterparty", label: "Counterparty" }, { field: "amount", label: "Amount" }, { field: "currency", label: "Currency" }], limit: 100 }], theme: null,
      }, provider: "local-fallback" })
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini", temperature: 0.1, max_completion_tokens: 1200, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: `Request:\n${prompt}\n\nAvailable model:\n${JSON.stringify(context)}` }] }),
    })
    if (!response.ok) throw new Error(`Report authoring provider failed (${response.status})`)
    const payload = await response.json()
    const raw = payload.choices?.[0]?.message?.content
    const parsed = typeof raw === "string" ? JSON.parse(raw) : null
    const validated = validateReportDefinitionPayload(parsed?.definition)
    if (!validated.ok) return NextResponse.json({ error: `The assistant proposed an invalid definition: ${validated.error}` }, { status: 422 })
    return NextResponse.json({ proposal: validated.value, provider: "openai" })
  } catch (error) { return serverError(error, { route: "report-definitions/author", stage: "proposal", userId: auth.user.id }) }
}
