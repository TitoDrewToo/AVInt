import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { scopedDb } from "@/lib/scoped-db"
import { profileDataQuality, type AnalystRow, type QualityRule } from "@/lib/analyst-workflows"

const MAX_ROWS = 5000

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { datasetId?: unknown; rules?: unknown } | null
  if (typeof body?.datasetId !== "string" || body.datasetId.length > 100) return NextResponse.json({ error: "datasetId is required" }, { status: 400 })
  const rules = Array.isArray(body.rules) ? body.rules as QualityRule[] : []
  if (rules.length > 50 || rules.some((rule) => !rule || typeof rule !== "object" || typeof (rule as { field?: unknown }).field !== "string")) return NextResponse.json({ error: "Invalid quality rules" }, { status: 400 })
  const db = scopedDb(auth.user.id)
  const { data: dataset, error: datasetError } = await db.from("datasets").select("id, name").eq("id", body.datasetId).maybeSingle()
  if (datasetError) return NextResponse.json({ error: datasetError.message }, { status: 500 })
  if (!dataset) return NextResponse.json({ error: "Dataset not found" }, { status: 404 })
  const { data: rows, error: rowsError, count } = await db.from("dataset_rows").select("row_index, data", { count: "exact" }).eq("dataset_id", body.datasetId).order("row_index").range(0, MAX_ROWS - 1)
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 })
  if ((count ?? 0) > MAX_ROWS) return NextResponse.json({ error: `Dataset has ${count} rows; quality profiling is limited to ${MAX_ROWS}` }, { status: 422 })
  const analystRows = (rows ?? []).map((row) => ({ ...(row.data as AnalystRow), __row_index: row.row_index }))
  return NextResponse.json({ dataset, result: profileDataQuality(analystRows, rules) })
}
