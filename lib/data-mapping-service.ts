import { applyDataMappingProfile } from "@/lib/data-mapping-engine"
import { getDataMappingProfile, recordDataMappingPreview } from "@/lib/data-mapping-store"
import { loadDataMappingProfileSource } from "@/lib/report-definition-engine"

export async function previewDataMappingProfile(userId: string, slug: string) {
  const profile = await getDataMappingProfile(userId, slug)
  const loaded = await loadDataMappingProfileSource(userId, profile)
  const { preview } = applyDataMappingProfile(profile, loaded)
  const { samples, ...summary } = preview
  await recordDataMappingPreview(userId, slug, profile.version, summary)
  return { ...preview, samples, activationReady: preview.activationReady ?? preview.sourceMatches > 0 }
}
