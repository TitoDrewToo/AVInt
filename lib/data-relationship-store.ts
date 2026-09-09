import { supabaseAdmin } from "@/lib/mcp-auth"
import { slugifyReportTitle, slugWithSuffix } from "@/lib/report-definitions"
import { getVirtualDatasetDefinition } from "@/lib/virtual-dataset-store"
import {
  validateDataRelationshipDefinitionPayload,
  type DataRelationshipDefinition,
  type DataRelationshipDefinitionInput,
  type DataRelationshipDefinitionListItem,
  type DataRelationshipPreviewSummary,
} from "@/lib/data-relationship-definitions"

export class DataRelationshipNotFoundError extends Error {}
export class DataRelationshipConflictError extends Error {}

async function validateAccess(userId: string, input: DataRelationshipDefinitionInput) {
  const [left, right] = await Promise.all([
    getVirtualDatasetDefinition(userId, input.leftVirtualDatasetSlug),
    getVirtualDatasetDefinition(userId, input.rightVirtualDatasetSlug),
  ])
  if (!left.fields.includes(input.leftKey)) throw new TypeError(`leftKey ${input.leftKey} is outside the left virtual dataset projection`)
  if (!right.fields.includes(input.rightKey)) throw new TypeError(`rightKey ${input.rightKey} is outside the right virtual dataset projection`)
  for (const [label, selected] of [["dateField", input.dateField], ["currencyField", input.currencyField]] as const) {
    if (!selected) continue
    const fields = selected.side === "left" ? left.fields : right.fields
    if (!fields.includes(selected.field)) throw new TypeError(`${label} is outside the ${selected.side} virtual dataset projection`)
  }
}

function hydrate(row: Record<string, unknown>): DataRelationshipDefinition {
  const validated = validateDataRelationshipDefinitionPayload(row.definition)
  if (!validated.ok || (row.status !== "draft" && row.status !== "active") || !Number.isInteger(row.version) || Number(row.version) < 1) throw new Error("Stored relationship definition is invalid")
  return { ...row, ...validated.value } as DataRelationshipDefinition
}

export async function listDataRelationships(userId: string, search?: string): Promise<DataRelationshipDefinitionListItem[]> {
  let query = supabaseAdmin.from("virtual_dataset_relationships").select("slug, title, description, definition, status, version, previewed_version, updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
  if (search?.trim()) query = query.ilike("title", `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const definition = validateDataRelationshipDefinitionPayload(row.definition)
    if (!definition.ok) throw new Error("Stored relationship definition is invalid")
    return { slug: row.slug, ...definition.value, status: row.status, version: row.version, previewed_version: row.previewed_version, updated_at: row.updated_at } as DataRelationshipDefinitionListItem
  })
}

export async function getDataRelationship(userId: string, slug: string, activeOnly = false): Promise<DataRelationshipDefinition> {
  let query = supabaseAdmin.from("virtual_dataset_relationships").select("*").eq("user_id", userId).eq("slug", slug).is("archived_at", null)
  if (activeOnly) query = query.eq("status", "active")
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataRelationshipNotFoundError(activeOnly ? "Active relationship not found" : "Relationship not found")
  return hydrate(data)
}

export async function createDataRelationship(userId: string, input: unknown, authoredBy: "user" | "assistant" = "user") {
  const validated = validateDataRelationshipDefinitionPayload(input)
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const base = slugifyReportTitle(validated.value.title)
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = slugWithSuffix(base, suffix)
    const { data, error } = await supabaseAdmin.from("virtual_dataset_relationships").insert({ user_id: userId, slug, title: validated.value.title, description: validated.value.description, definition: validated.value, status: "draft", authored_by: authoredBy }).select("*").single()
    if (!error && data) return hydrate(data)
    if (error?.code !== "23505") throw new Error(error?.message ?? "Relationship could not be created")
  }
  throw new DataRelationshipConflictError("A unique relationship slug could not be allocated")
}

export async function updateDataRelationship(userId: string, slug: string, input: unknown, expectedVersion: number, authoredBy: "user" | "assistant" = "user") {
  const current = await getDataRelationship(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || current.version !== expectedVersion) throw new DataRelationshipConflictError(`Relationship changed since version ${expectedVersion}`)
  const validated = validateDataRelationshipDefinitionPayload({ ...current, ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}) })
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const { data, error } = await supabaseAdmin.from("virtual_dataset_relationships").update({ title: validated.value.title, description: validated.value.description, definition: validated.value, status: "draft", authored_by: authoredBy, version: expectedVersion + 1, previewed_version: null, preview_summary: null, activated_by: null, activated_at: null }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataRelationshipConflictError("Relationship changed while it was being saved")
  return hydrate(data)
}

export async function recordDataRelationshipPreview(userId: string, slug: string, version: number, summary: DataRelationshipPreviewSummary) {
  const { data, error } = await supabaseAdmin.from("virtual_dataset_relationships").update({ previewed_version: version, preview_summary: summary }).eq("user_id", userId).eq("slug", slug).eq("version", version).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataRelationshipConflictError("Relationship changed while it was being previewed")
  return hydrate(data)
}

export async function activateDataRelationship(userId: string, slug: string, expectedVersion: number) {
  const current = await getDataRelationship(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1 || current.version !== expectedVersion) throw new DataRelationshipConflictError(`Relationship changed since version ${expectedVersion}`)
  const preview = current.preview_summary
  if (current.previewed_version !== expectedVersion || !preview) throw new DataRelationshipConflictError("Preview this exact relationship version before activation")
  if (!preview.cardinalityValid) throw new DataRelationshipConflictError("The preview violates the declared cardinality")
  if (!preview.withinRowLimit) throw new DataRelationshipConflictError("The preview exceeds the relationship row limit")
  if (preview.projectedRows < 1) throw new DataRelationshipConflictError("The preview found no matching rows")
  const activatedAt = new Date().toISOString()
  const nextVersion = expectedVersion + 1
  const { data, error } = await supabaseAdmin.from("virtual_dataset_relationships").update({ status: "active", version: nextVersion, previewed_version: nextVersion, preview_summary: { ...preview, relationshipVersion: nextVersion }, activated_by: userId, activated_at: activatedAt }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).eq("previewed_version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DataRelationshipConflictError("Relationship changed while it was being activated")
  return hydrate(data)
}
