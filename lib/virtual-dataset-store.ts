import { supabaseAdmin } from "@/lib/mcp-auth"
import { McpUserFacingError } from "@/lib/mcp-errors"
import { slugifyReportTitle, slugWithSuffix, type ReportDefinitionInput } from "@/lib/report-definitions"
import { validateDefinitionAccess } from "@/lib/report-definition-store"
import {
  validateVirtualDatasetDefinitionPayload,
  type VirtualDatasetDefinition,
  type VirtualDatasetDefinitionInput,
  type VirtualDatasetDefinitionListItem,
} from "@/lib/virtual-dataset-definitions"

export class VirtualDatasetNotFoundError extends McpUserFacingError {}
export class VirtualDatasetConflictError extends McpUserFacingError {}
export class VirtualDatasetDependencyError extends McpUserFacingError {}

async function validateAccess(userId: string, input: VirtualDatasetDefinitionInput) {
  const reportShape: ReportDefinitionInput = {
    title: "Virtual dataset access check",
    description: input.description,
    source: input.source,
    scope: input.scope,
    period: { kind: "all" },
    filters: input.filters,
    blocks: [{ type: "table", title: "Projected fields", columns: input.fields.map((field) => ({ field })), limit: 1 }],
    theme: null,
  }
  await validateDefinitionAccess(userId, reportShape)
}

export async function listVirtualDatasetDefinitions(userId: string, search?: string): Promise<VirtualDatasetDefinitionListItem[]> {
  let query = supabaseAdmin.from("virtual_dataset_definitions").select("slug, title, description, source, fields, authored_by, version, updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
  if (search?.trim()) query = query.ilike("title", `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as VirtualDatasetDefinitionListItem[]
}

export async function getVirtualDatasetDefinition(userId: string, slug: string): Promise<VirtualDatasetDefinition> {
  const { data, error } = await supabaseAdmin.from("virtual_dataset_definitions").select("*").eq("user_id", userId).eq("slug", slug).is("archived_at", null).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new VirtualDatasetNotFoundError("Virtual dataset definition not found")
  return data as VirtualDatasetDefinition
}

export async function createVirtualDatasetDefinition(userId: string, input: unknown, authoredBy: "user" | "assistant" = "user"): Promise<VirtualDatasetDefinition> {
  const validated = validateVirtualDatasetDefinitionPayload(input)
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const requestedSlug = input && typeof input === "object" && "slug" in input ? input.slug : undefined
  if (requestedSlug !== undefined && (typeof requestedSlug !== "string" || !/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(requestedSlug))) throw new TypeError("slug must be a valid virtual dataset handle")
  const base = typeof requestedSlug === "string" ? requestedSlug : slugifyReportTitle(validated.value.title)
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = slugWithSuffix(base, suffix)
    const { data, error } = await supabaseAdmin.from("virtual_dataset_definitions").insert({ user_id: userId, slug, ...validated.value, authored_by: authoredBy }).select("*").single()
    if (!error && data) return data as VirtualDatasetDefinition
    if (error?.code !== "23505") throw new Error(error?.message ?? "Virtual dataset could not be created")
    if (requestedSlug) throw new VirtualDatasetConflictError("The requested virtual dataset slug already exists; use its current version to update it")
  }
  throw new VirtualDatasetConflictError("A unique virtual dataset slug could not be allocated")
}

export async function updateVirtualDatasetDefinition(userId: string, slug: string, input: unknown, expectedVersion: number, authoredBy: "user" | "assistant" = "user"): Promise<VirtualDatasetDefinition> {
  const current = await getVirtualDatasetDefinition(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion is required")
  if (current.version !== expectedVersion) throw new VirtualDatasetConflictError(`Virtual dataset changed since version ${expectedVersion}`)
  const validated = validateVirtualDatasetDefinitionPayload({ ...current, ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}) })
  if (!validated.ok) throw new TypeError(validated.error)
  await validateAccess(userId, validated.value)
  const { data, error } = await supabaseAdmin.from("virtual_dataset_definitions").update({ ...validated.value, authored_by: authoredBy, version: expectedVersion + 1 }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new VirtualDatasetConflictError("Virtual dataset changed while it was being saved")
  return data as VirtualDatasetDefinition
}

export async function archiveVirtualDatasetDefinition(userId: string, slug: string): Promise<{ slug: string; archived_at: string }> {
  const current = await getVirtualDatasetDefinition(userId, slug)
  const [{ data: relationships, error: relationshipError }, { data: reports, error: reportError }] = await Promise.all([
    supabaseAdmin.from("virtual_dataset_relationships").select("slug, title, definition").eq("user_id", userId).is("archived_at", null),
    supabaseAdmin.from("report_definitions").select("slug, title, source").eq("user_id", userId).is("archived_at", null),
  ])
  if (relationshipError) throw new Error(relationshipError.message)
  if (reportError) throw new Error(reportError.message)
  const dependentRelationships = (relationships ?? []).filter((row) => row.definition?.leftVirtualDatasetSlug === current.slug || row.definition?.rightVirtualDatasetSlug === current.slug)
  const dependentReports = (reports ?? []).filter((row) => row.source?.kind === "virtual_dataset" && row.source?.slug === current.slug)
  const dependents = [...dependentRelationships.map((row) => `relationship ${row.slug}`), ...dependentReports.map((row) => `report ${row.slug}`)]
  if (dependents.length) throw new VirtualDatasetDependencyError(`Virtual dataset ${current.slug} cannot be deleted; it is referenced by ${dependents.join(", ")}`)
  const archivedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from("virtual_dataset_definitions").update({ archived_at: archivedAt }).eq("user_id", userId).eq("slug", slug).is("archived_at", null).select("slug, archived_at").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new VirtualDatasetNotFoundError("Virtual dataset definition not found")
  return data as { slug: string; archived_at: string }
}
