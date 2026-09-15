import { NextRequest, NextResponse } from "next/server"
import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { scopedDb } from "@/lib/scoped-db"
import { reconciliationDefinitionSchema } from "@/lib/reconciliation"

export async function GET(request: NextRequest) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const { data, error } = await scopedDb(auth.user.id).from("reconciliation_definitions").select("id, slug, title, description, source_a_dataset_id, source_b_dataset_id, key_fields, comparisons, version, updated_at").is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ definitions: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  const checked = reconciliationDefinitionSchema.safeParse(body)
  if (!checked.success) return NextResponse.json({ error: checked.error.issues[0]?.message ?? "Invalid reconciliation definition" }, { status: 400 })
  const input = checked.data
  const slug = input.slug ?? (input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "reconciliation")
  const { data: datasets, error: datasetError } = await scopedDb(auth.user.id).from("datasets").select("id").in("id", [input.sourceADatasetId, input.sourceBDatasetId])
  if (datasetError) return NextResponse.json({ error: datasetError.message }, { status: 500 })
  if ((datasets ?? []).length !== 2) return NextResponse.json({ error: "Both selected datasets must belong to this account" }, { status: 400 })
  const { data: columns, error: columnError } = await scopedDb(auth.user.id).from("dataset_columns").select("dataset_id, key, data_type").in("dataset_id", [input.sourceADatasetId, input.sourceBDatasetId])
  if (columnError) return NextResponse.json({ error: columnError.message }, { status: 500 })
  const columnsByDataset = new Map<string, Map<string, string>>()
  for (const column of columns ?? []) columnsByDataset.set(column.dataset_id, new Map([...(columnsByDataset.get(column.dataset_id)?.entries() ?? []), [column.key, column.data_type]]))
  const leftColumns = columnsByDataset.get(input.sourceADatasetId) ?? new Map()
  const rightColumns = columnsByDataset.get(input.sourceBDatasetId) ?? new Map()
  const missingKey = input.keyFields.find((key) => !leftColumns.has(key) || !rightColumns.has(key))
  if (missingKey) return NextResponse.json({ error: `Match key ${missingKey} must exist in both datasets` }, { status: 400 })
  const missingComparison = input.comparisons.find((rule) => !leftColumns.has(rule.leftField) || !rightColumns.has(rule.rightField))
  if (missingComparison) return NextResponse.json({ error: `Comparison field ${missingComparison.leftField} must exist in both datasets` }, { status: 400 })
  const payload = { user_id: auth.user.id, slug, title: input.title, description: input.description ?? null, source_a_dataset_id: input.sourceADatasetId, source_b_dataset_id: input.sourceBDatasetId, key_fields: input.keyFields, comparisons: input.comparisons, version: 1, archived_at: null }
  const { data: existing, error: existingError } = await scopedDb(auth.user.id).from("reconciliation_definitions").select("id").eq("slug", slug).is("archived_at", null).maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  const { data, error } = existing
    ? await supabaseAdmin.from("reconciliation_definitions").update({ ...payload, version: 1 }).eq("id", existing.id).select("id, slug, title, description, source_a_dataset_id, source_b_dataset_id, key_fields, comparisons, version, updated_at").single()
    : await supabaseAdmin.from("reconciliation_definitions").insert(payload).select("id, slug, title, description, source_a_dataset_id, source_b_dataset_id, key_fields, comparisons, version, updated_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ definition: data }, { status: 201 })
}
