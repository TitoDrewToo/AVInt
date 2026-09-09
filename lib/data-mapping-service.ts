import { applyDataMappingProfile } from "@/lib/data-mapping-engine"
import { getDataMappingProfile, recordDataMappingPreview } from "@/lib/data-mapping-store"
import { loadReportDefinitionSource } from "@/lib/report-definition-engine"
import type { ReportDefinition } from "@/lib/report-definitions"

export async function previewDataMappingProfile(userId: string, slug: string) {
  const profile = await getDataMappingProfile(userId, slug)
  const harness: ReportDefinition = {
    id: "mapping-preview", user_id: userId, slug: "mapping-preview", authored_by: "user", version: 1,
    archived_at: null, created_at: "", updated_at: "", title: "Mapping preview", description: null,
    source: profile.source, scope: profile.scope, period: { kind: "all" }, filters: [],
    blocks: [{ type: "note", text: "Mapping preview" }], theme: null,
  }
  const loaded = await loadReportDefinitionSource(userId, harness)
  const { preview } = applyDataMappingProfile(profile, loaded)
  const { samples, ...summary } = preview
  await recordDataMappingPreview(userId, slug, profile.version, summary)
  return { ...preview, samples, activationReady: preview.sourceMatches > 0 }
}
