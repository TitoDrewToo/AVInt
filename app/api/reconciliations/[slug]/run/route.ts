import { NextRequest, NextResponse } from "next/server"
import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { scopedDb } from "@/lib/scoped-db"
import { reconcileRows, reconciliationInputSchema, type EvidenceRow, type ReconciliationInput } from "@/lib/reconciliation"

const MAX_ROWS = 5_000

async function loadEvidence(userId: string, datasetId: string): Promise<EvidenceRow[]> {
  const { data: dataset, error: datasetError } = await scopedDb(userId).from("datasets").select("id, file_id, files!inner(filename)").eq("id", datasetId).maybeSingle()
  if (datasetError) throw new Error(datasetError.message)
  if (!dataset) throw new Error("Selected dataset does not exist or is not accessible")
  const file = Array.isArray(dataset.files) ? dataset.files[0] : dataset.files
  const { data: rows, error, count } = await scopedDb(userId).from("dataset_rows").select("row_index, data, data_raw", { count: "exact" }).eq("dataset_id", datasetId).order("row_index").range(0, MAX_ROWS - 1)
  if (error) throw new Error(error.message)
  if ((count ?? 0) > MAX_ROWS) throw new Error(`Dataset ${datasetId} exceeds the ${MAX_ROWS.toLocaleString()} row reconciliation limit`)
  return (rows ?? []).map((row) => ({ datasetId, fileId: dataset.file_id, filename: String(file?.filename ?? "unknown"), rowIndex: row.row_index, values: (row.data ?? {}) as Record<string, unknown>, rawValues: (row.data_raw ?? {}) as Record<string, unknown> }))
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  try {
    const { slug } = await context.params
    const { data: definition, error } = await scopedDb(auth.user.id).from("reconciliation_definitions").select("id, slug, title, description, source_a_dataset_id, source_b_dataset_id, key_fields, comparisons, version, updated_at").eq("slug", slug).is("archived_at", null).maybeSingle()
    if (error) throw new Error(error.message)
    if (!definition) return NextResponse.json({ error: "Reconciliation definition not found" }, { status: 404 })
    const checked = reconciliationInputSchema.safeParse({ title: definition.title, description: definition.description, sourceADatasetId: definition.source_a_dataset_id, sourceBDatasetId: definition.source_b_dataset_id, keyFields: definition.key_fields, comparisons: definition.comparisons })
    if (!checked.success) return NextResponse.json({ error: "The saved reconciliation definition is invalid; review its mapping rules" }, { status: 422 })
    const input: ReconciliationInput = checked.data
    const [sourceA, sourceB] = await Promise.all([loadEvidence(auth.user.id, input.sourceADatasetId), loadEvidence(auth.user.id, input.sourceBDatasetId)])
    return NextResponse.json({ definition: { slug: definition.slug, version: definition.version }, result: reconcileRows(input, sourceA, sourceB) })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Reconciliation could not be run" }, { status: 500 })
  }
}
