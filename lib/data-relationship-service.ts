import { applyDataRelationship, DataRelationshipExecutionError } from "@/lib/data-relationship-engine"
import { getDataRelationship, recordDataRelationshipPreview } from "@/lib/data-relationship-store"
import { loadReportDefinitionSource } from "@/lib/report-definition-engine"
import type { ReportDefinition } from "@/lib/report-definitions"

async function loadVirtual(userId: string, slug: string) {
  const harness: ReportDefinition = {
    id: "relationship-preview", user_id: userId, slug: "relationship-preview", authored_by: "user", version: 1,
    archived_at: null, created_at: "", updated_at: "", title: "Relationship preview", description: null,
    source: { kind: "virtual_dataset", slug }, scope: null, period: { kind: "all" }, filters: [],
    blocks: [{ type: "note", text: "Relationship preview" }], theme: null,
  }
  return loadReportDefinitionSource(userId, harness)
}

export async function previewDataRelationship(userId: string, slug: string) {
  const relationship = await getDataRelationship(userId, slug)
  const [left, right] = await Promise.all([
    loadVirtual(userId, relationship.leftVirtualDatasetSlug),
    loadVirtual(userId, relationship.rightVirtualDatasetSlug),
  ])
  try {
    const { preview, samples } = applyDataRelationship(relationship, left, right)
    await recordDataRelationshipPreview(userId, slug, relationship.version, preview)
    return { ...preview, samples, activationReady: preview.projectedRows > 0 }
  } catch (error) {
    const preview = error instanceof DataRelationshipExecutionError && "preview" in error ? (error as DataRelationshipExecutionError & { preview: import("@/lib/data-relationship-definitions").DataRelationshipPreviewSummary }).preview : null
    if (!preview) throw error
    await recordDataRelationshipPreview(userId, slug, relationship.version, preview)
    return { ...preview, activationReady: false, refusal: error instanceof Error ? error.message : "Relationship preview failed" }
  }
}
