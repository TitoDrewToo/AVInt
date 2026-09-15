import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { scopedDb } from "@/lib/scoped-db"
import { profileDataQuality, type AnalystRow, type QualityRule } from "@/lib/analyst-workflows"
import { resolveReportFolderScope } from "@/lib/report-folder-scope-server"

const MAX_ROWS = 5000

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { datasetId?: unknown; folderId?: unknown; rules?: unknown } | null
  const datasetId = typeof body?.datasetId === "string" && body.datasetId.length <= 100 ? body.datasetId : null
  const folderId = typeof body?.folderId === "string" && body.folderId.length <= 100 ? body.folderId : null
  if ((datasetId && folderId) || (!datasetId && !folderId)) return NextResponse.json({ error: "Provide exactly one of datasetId or folderId" }, { status: 400 })
  const rules = Array.isArray(body?.rules) ? body.rules as QualityRule[] : []
  if (rules.length > 50 || rules.some((rule) => !rule || typeof rule !== "object" || typeof (rule as { field?: unknown }).field !== "string")) return NextResponse.json({ error: "Invalid quality rules" }, { status: 400 })
  const db = scopedDb(auth.user.id)
  const datasetQuery = db.from("datasets").select("id, name, file_id, files!inner(folder_id)").is("archived_at", null)
  if (datasetId) datasetQuery.eq("id", datasetId)
  if (folderId) {
    const scope = await resolveReportFolderScope(auth.user.id, folderId)
    datasetQuery.in("files.folder_id", scope?.folderIds ?? [])
  }
  const { data: datasets, error: datasetError } = await datasetQuery.order("id").limit(100)
  if (datasetError) return NextResponse.json({ error: datasetError.message }, { status: 500 })
  if (!datasets?.length) return NextResponse.json({ error: datasetId ? "Dataset not found" : "Folder contains no datasets" }, { status: 404 })
  const selectedDatasetIds = datasets.map((item) => item.id)
  const { data: rows, error: rowsError, count } = await db.from("dataset_rows").select("row_index, data", { count: "exact" }).in("dataset_id", selectedDatasetIds).order("row_index").range(0, MAX_ROWS - 1)
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 })
  if ((count ?? 0) > MAX_ROWS) return NextResponse.json({ error: `Dataset has ${count} rows; quality profiling is limited to ${MAX_ROWS}` }, { status: 422 })
  const analystRows = (rows ?? []).map((row) => ({ ...(row.data as AnalystRow), __row_index: row.row_index }))
  return NextResponse.json({ datasets, result: profileDataQuality(analystRows, rules) })
}
