import { supabaseAdmin } from "@/lib/mcp-auth"
import { slugifyReportTitle, slugWithSuffix, type ReportDefinitionInput } from "@/lib/report-definitions"
import { validateDefinitionAccess } from "@/lib/report-definition-store"
import {
  dataMappingRuleSourceFields,
  isReconciliationMappingRule,
  validateDataMappingProfilePayload,
  type DataMappingPreviewSummary,
  type DataMappingProfile,
  type DataMappingProfileInput,
  type DataMappingProfileListItem,
} from "@/lib/data-mapping-definitions"

export class DataMappingProfileNotFoundError extends Error {}
export class DataMappingProfileConflictError extends Error {}

async function validateAccess(userId: string, input: DataMappingProfileInput) {
  const reconciliation = input.mappings.every(isReconciliationMappingRule)
  const definition: ReportDefinitionInput = {
    title: "Data mapping access check",
    description: input.description,
    source: input.source,
    scope: input.scope,
    period: { kind: "all" },
    filters: [],
    blocks: reconciliation
      ? [{ type: "stat", title: "Source rows", metric: { aggregation: "count" } }]
      : [{ type: "table", title: "Source fields", columns: [...new Set(input.mappings.flatMap(dataMappingRuleSourceFields))].map((field) => ({ field })), limit: 1 }],
    theme: null,
  }
  await validateDefinitionAccess(userId, definition)
}

export async function listDataMappingProfiles(userId: string, search?: string): Promise<DataMappingProfileListItem[]> {
  let query = supabaseAdmin.from("data_mapping_profiles").select("slug, title, description, source, mappings, status, authored_by, version, previewed_version, preview_summary, updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
  if (search?.trim()) query = query.ilike("title", `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as DataMappingProfileListItem[]
}

export async function getDataMappingProfile(userId: string, slug: string, activeOnly = false): Promise<DataMappingProfile> {
  let query = supabaseAdmin.from("data_mapping_profiles").select("*").eq("user_id", userId).eq("slug", slug).is("archived_at", null)
  if (activeOnly) query = query.eq("status", "active")
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataMappingProfileNotFoundError(activeOnly ? "Active mapping profile not found" : "Mapping profile not found")
  const validated = validateDataMappingProfilePayload(data)
  if (!validated.ok || (data.status !== "draft" && data.status !== "active") || !Number.isInteger(data.version) || data.version < 1) throw new Error("Stored mapping profile is invalid")
  return { ...data, ...validated.value } as DataMappingProfile
}

export async function createDataMappingProfile(userId: string, input: unknown, authoredBy: "user" | "assistant" = "user"): Promise<DataMappingProfile> {
  const validated = validateDataMappingProfilePayload(input)
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const base = slugifyReportTitle(validated.value.title)
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = slugWithSuffix(base, suffix)
    const { data, error } = await supabaseAdmin.from("data_mapping_profiles").insert({ user_id: userId, slug, ...validated.value, status: "draft", authored_by: authoredBy }).select("*").single()
    if (!error && data) return data as DataMappingProfile
    if (error?.code !== "23505") throw new Error(error?.message ?? "Mapping profile could not be created")
  }
  throw new DataMappingProfileConflictError("A unique mapping profile slug could not be allocated")
}

export async function updateDataMappingProfile(userId: string, slug: string, input: unknown, expectedVersion: number, authoredBy: "user" | "assistant" = "user"): Promise<DataMappingProfile> {
  const current = await getDataMappingProfile(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion is required")
  if (current.version !== expectedVersion) throw new DataMappingProfileConflictError(`Mapping profile changed since version ${expectedVersion}`)
  const validated = validateDataMappingProfilePayload({ ...current, ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}) })
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const { data, error } = await supabaseAdmin.from("data_mapping_profiles").update({ ...validated.value, status: "draft", authored_by: authoredBy, version: expectedVersion + 1, previewed_version: null, preview_summary: null, activated_by: null, activated_at: null }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataMappingProfileConflictError("Mapping profile changed while it was being saved")
  return data as DataMappingProfile
}

export async function recordDataMappingPreview(userId: string, slug: string, version: number, summary: DataMappingPreviewSummary): Promise<DataMappingProfile> {
  const { data, error } = await supabaseAdmin.from("data_mapping_profiles").update({ previewed_version: version, preview_summary: summary }).eq("user_id", userId).eq("slug", slug).eq("version", version).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataMappingProfileConflictError("Mapping profile changed while it was being previewed")
  return data as DataMappingProfile
}

export async function activateDataMappingProfile(userId: string, slug: string, expectedVersion: number): Promise<DataMappingProfile> {
  const current = await getDataMappingProfile(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || current.version !== expectedVersion) throw new DataMappingProfileConflictError(`Mapping profile changed since version ${expectedVersion}`)
  if (current.previewed_version !== expectedVersion || !current.preview_summary) throw new DataMappingProfileConflictError("Preview this exact mapping profile version before activation")
  if (current.preview_summary.mode === "reconciliation" && current.preview_summary.activationReady !== true) throw new DataMappingProfileConflictError("The reconciliation preview contains unresolved required fields or conflicts")
  if (current.preview_summary.sourceMatches < 1) throw new DataMappingProfileConflictError("The preview found no source values to map")
  const activatedAt = new Date().toISOString()
  const nextVersion = expectedVersion + 1
  const { data, error } = await supabaseAdmin.from("data_mapping_profiles").update({ status: "active", version: nextVersion, previewed_version: nextVersion, preview_summary: { ...current.preview_summary, profileVersion: nextVersion }, activated_by: userId, activated_at: activatedAt }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).eq("previewed_version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataMappingProfileConflictError("Mapping profile changed while it was being activated")
  return data as DataMappingProfile
}
