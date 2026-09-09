import { supabaseAdmin } from "@/lib/mcp-auth"
import { RECORD_DEFINITION_FIELDS, referencedDefinitionFields, slugifyReportTitle, slugWithSuffix, validateReportDefinitionPayload, type ReportDefinition, type ReportDefinitionInput, type ReportDefinitionListItem, type ReportMetric } from "@/lib/report-definitions"
import { resolveReportFolderScope } from "@/lib/report-folder-scope-server"
import { validateDataMappingProfilePayload } from "@/lib/data-mapping-definitions"
import { relationshipOutputField, validateDataRelationshipDefinitionPayload } from "@/lib/data-relationship-definitions"

export class ReportDefinitionNotFoundError extends Error {}
export class ReportDefinitionConflictError extends Error {}

async function resolveSelectedFiles(userId: string, fileIds: string[]) {
  const { data, error } = await supabaseAdmin.from("files").select("id, filename, folder_id").eq("user_id", userId).in("id", fileIds)
  if (error) throw new Error(error.message)
  const byId = new Map((data ?? []).map((file) => [file.id, file]))
  if (byId.size !== fileIds.length || fileIds.some((id) => !byId.has(id))) throw new TypeError("Selected files do not exist or are not accessible")
  return fileIds.map((id) => byId.get(id)!)
}

function metrics(input: ReportDefinitionInput): ReportMetric[] {
  return input.blocks.flatMap((block) => block.type === "kpi" ? block.items.map((item) => item.metric) : block.type === "share" || block.type === "stat" || block.type === "series" ? [block.metric] : block.type === "comparison" ? block.items.map((item) => item.metric) : [])
}

export async function validateDefinitionAccess(userId: string, input: ReportDefinitionInput) {
  const logoUrl = input.theme?.client?.logoUrl
  if (logoUrl) {
    const parsed = new URL(logoUrl)
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
    if (!match) throw new TypeError("theme.client.logoUrl must be a public Supabase Storage object")
    const { data: object, error: objectError } = await supabaseAdmin.from("objects").select("owner_id").eq("bucket_id", match[1]).eq("name", decodeURIComponent(match[2])).maybeSingle()
    if (objectError) throw new Error(objectError.message)
    if (!object || object.owner_id !== userId) throw new TypeError("theme.client.logoUrl must reference a storage object owned by this account")
  }
  if (input.scope?.folderId) await resolveReportFolderScope(userId, input.scope.folderId)
  const referenced = referencedDefinitionFields(input)
  if (input.source.kind === "mapping_profile") {
    if (input.scope?.folderId) throw new TypeError("Report scope must be defined by the mapping profile source")
    const { data, error } = await supabaseAdmin.from("data_mapping_profiles").select("title, description, source, scope, mappings, status").eq("user_id", userId).eq("slug", input.source.slug).eq("status", "active").is("archived_at", null).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TypeError("The selected active mapping profile does not exist or is not accessible")
    const profile = validateDataMappingProfilePayload(data)
    if (!profile.ok) throw new TypeError("The selected mapping profile is invalid")
    const mappings = profile.value.mappings
    const targets = new Set<string>(mappings.map((rule) => rule.targetField))
    const invalidMappedMetric = metrics(input).find((metric) => {
      if (metric.aggregation === "count" || metric.aggregation === "count_distinct") return false
      if (metric.aggregation === "ratio") return [metric.numerator, metric.denominator].some((field) => field && targets.has(field) && field !== "amount")
      return Boolean(metric.field && targets.has(metric.field) && metric.field !== "amount")
    })
    if (invalidMappedMetric) throw new TypeError("Mapped non-numeric fields cannot use numeric aggregation")
    const remaining = [...new Set([...referenced.filter((field) => !targets.has(field)), ...mappings.map((rule) => rule.sourceField)])]
    return validateDefinitionAccess(userId, {
      ...input,
      source: profile.value.source,
      scope: profile.value.scope,
      filters: [],
      blocks: remaining.length
        ? [{ type: "table", title: "Mapped source fields", columns: remaining.map((field) => ({ field })), limit: 1 }]
        : [{ type: "stat", title: "Mapped rows", metric: { aggregation: "count" } }],
    })
  }
  if (input.source.kind === "virtual_dataset") {
    if (input.scope?.folderId) throw new TypeError("Report scope must be defined by the virtual dataset source")
    const { data, error } = await supabaseAdmin.from("virtual_dataset_definitions").select("source, scope, filters, fields").eq("user_id", userId).eq("slug", input.source.slug).is("archived_at", null).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TypeError("The selected virtual dataset does not exist or is not accessible")
    const projectedFields = Array.isArray(data.fields) ? data.fields.filter((field): field is string => typeof field === "string") : []
    const unknown = referenced.filter((field) => !projectedFields.includes(field))
    if (unknown.length) throw new TypeError(`Definition references fields outside the virtual dataset projection: ${unknown.join(", ")}`)
    return validateDefinitionAccess(userId, {
      ...input,
      source: data.source,
      scope: data.scope,
      filters: [...(Array.isArray(data.filters) ? data.filters : []), ...input.filters],
    })
  }
  if (input.source.kind === "relationship") {
    if (input.scope?.folderId) throw new TypeError("Report scope must be defined by the relationship's virtual datasets")
    const { data, error } = await supabaseAdmin.from("virtual_dataset_relationships").select("definition, status").eq("user_id", userId).eq("slug", input.source.slug).eq("status", "active").is("archived_at", null).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TypeError("The selected active relationship does not exist or is not accessible")
    const relationship = validateDataRelationshipDefinitionPayload(data.definition)
    if (!relationship.ok) throw new TypeError("The selected relationship is invalid")
    const { data: virtuals, error: virtualError } = await supabaseAdmin.from("virtual_dataset_definitions").select("slug, fields").eq("user_id", userId).in("slug", [relationship.value.leftVirtualDatasetSlug, relationship.value.rightVirtualDatasetSlug]).is("archived_at", null)
    if (virtualError) throw new Error(virtualError.message)
    const fieldsBySlug = new Map((virtuals ?? []).map((item) => [item.slug, Array.isArray(item.fields) ? item.fields.filter((field): field is string => typeof field === "string") : []]))
    const leftFields = fieldsBySlug.get(relationship.value.leftVirtualDatasetSlug)
    const rightFields = fieldsBySlug.get(relationship.value.rightVirtualDatasetSlug)
    if (!leftFields || !rightFields) throw new TypeError("A relationship virtual dataset no longer exists or is not accessible")
    const available = new Set([...leftFields.map((field) => relationshipOutputField("left", field)), ...rightFields.map((field) => relationshipOutputField("right", field))])
    const unknown = referenced.filter((field) => !available.has(field))
    if (unknown.length) throw new TypeError(`Definition references fields outside the relationship projection: ${unknown.join(", ")}`)
    return
  }
  if (input.source.kind === "records") {
    if (input.source.fileIds) await resolveSelectedFiles(userId, input.source.fileIds)
    const availableFields = new Set<string>([...RECORD_DEFINITION_FIELDS, "filename", "folder_id"])
    const { data, error } = await supabaseAdmin.from("record_attributes").select("field_key, value_type").eq("user_id", userId)
    if (error) throw new Error(error.message)
    const types = new Map<string, Set<string>>()
    for (const row of data ?? []) {
      availableFields.add(row.field_key)
      const values = types.get(row.field_key) ?? new Set<string>(); values.add(row.value_type); types.set(row.field_key, values)
    }
    const unknown = referenced.filter((field) => !availableFields.has(field))
    if (unknown.length) throw new TypeError(`Definition references unavailable fields: ${unknown.join(", ")}`)
    const numericCore = new Set(["amount", "amount_base", "confidence"])
    const invalidMetric = metrics(input).find((metric) => metric.aggregation !== "count" && metric.aggregation !== "count_distinct" && metric.aggregation !== "ratio" && metric.field && !numericCore.has(metric.field) && !types.get(metric.field)?.has("number"))
    if (invalidMetric?.field) throw new TypeError(`${invalidMetric.field} is not a numeric field and cannot use ${invalidMetric.aggregation}`)
    return
  }
  let datasets: Array<{ id: string; file_id: string; sheet_name: string | null }> = []
  let dataset: { id: string; file_id: string; sheet_name: string | null } | null = null
  if (input.source.datasetId) {
    const { data, error } = await supabaseAdmin.from("datasets").select("id, file_id, sheet_name").eq("id", input.source.datasetId).eq("user_id", userId).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new TypeError("The selected dataset does not exist or is not accessible")
    await resolveSelectedFiles(userId, [data.file_id])
    dataset = data; datasets = [data]
  } else if (input.source.folderId) {
    const scope = await resolveReportFolderScope(userId, input.source.folderId)
    const { data: files, error: filesError } = await supabaseAdmin.from("files").select("id").eq("user_id", userId).in("folder_id", scope?.folderIds ?? [])
    if (filesError) throw new Error(filesError.message)
    const { data: folderDatasets, error: datasetError } = await supabaseAdmin.from("datasets").select("id, file_id, sheet_name").eq("user_id", userId).in("file_id", (files ?? []).map((file) => file.id))
    if (datasetError) throw new Error(datasetError.message)
    datasets = (folderDatasets ?? []).sort((a, b) => a.id.localeCompare(b.id))
    if (!datasets.length) throw new TypeError("The selected folder contains no datasets")
  } else if (input.source.fileIds) {
    const selectedFiles = await resolveSelectedFiles(userId, input.source.fileIds)
    const { data: selectedDatasets, error: datasetError } = await supabaseAdmin.from("datasets").select("id, file_id, sheet_name").eq("user_id", userId).in("file_id", selectedFiles.map((file) => file.id))
    if (datasetError) throw new Error(datasetError.message)
    const position = new Map(input.source.fileIds.map((id, index) => [id, index]))
    datasets = (selectedDatasets ?? []).sort((a, b) => (position.get(a.file_id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.file_id) ?? Number.MAX_SAFE_INTEGER) || String(a.sheet_name).localeCompare(String(b.sheet_name)) || a.id.localeCompare(b.id))
    if (!datasets.length) throw new TypeError("The selected files contain no datasets")
  }
  if (input.scope?.folderId && (dataset || input.source.fileIds)) {
    const scope = await resolveReportFolderScope(userId, input.scope.folderId)
    const files = dataset
      ? await resolveSelectedFiles(userId, [dataset.file_id])
      : await resolveSelectedFiles(userId, input.source.fileIds!)
    if (files.some((file) => !scope?.folderIds.includes(file.folder_id))) throw new TypeError("A selected dataset is outside the report folder scope")
  }
  const { data: columns, error: columnError } = await supabaseAdmin.from("dataset_columns").select("key, data_type, dataset_id").in("dataset_id", datasets.map((item) => item.id)).eq("user_id", userId)
  if (columnError) throw new Error(columnError.message)
  const baseDatasetId = datasets[0].id
  const typeByField = new Map((columns ?? []).filter((column) => column.dataset_id === baseDatasetId).map((column) => [column.key, column.data_type]))
  const unknown = referenced.filter((field) => !typeByField.has(field))
  if (unknown.length) throw new TypeError(`Definition references unavailable dataset fields: ${unknown.join(", ")}`)
  if (input.source.dateField && typeByField.get(input.source.dateField) !== "date") throw new TypeError("source.dateField must reference a date column")
  if (input.source.currencyField && typeByField.get(input.source.currencyField) !== "text") throw new TypeError("source.currencyField must reference a text column")
  const invalidMetric = metrics(input).find((metric) => metric.aggregation !== "count" && metric.aggregation !== "count_distinct" && metric.aggregation !== "ratio" && metric.field && typeByField.get(metric.field) !== "number")
  if (invalidMetric?.field) throw new TypeError(`${invalidMetric.field} is not a numeric dataset column and cannot use ${invalidMetric.aggregation}`)
}

export async function listReportDefinitions(userId: string, search?: string): Promise<ReportDefinitionListItem[]> {
  let query = supabaseAdmin.from("report_definitions").select("slug, title, description, source, period, authored_by, version, updated_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(100)
  if (search?.trim()) query = query.ilike("title", `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as ReportDefinitionListItem[]
}

export async function getReportDefinition(userId: string, slug: string): Promise<ReportDefinition> {
  const { data, error } = await supabaseAdmin.from("report_definitions").select("*").eq("user_id", userId).eq("slug", slug).is("archived_at", null).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ReportDefinitionNotFoundError("Report definition not found")
  return data as ReportDefinition
}

export async function createReportDefinition(userId: string, input: unknown, authoredBy: "user" | "assistant" = "user"): Promise<ReportDefinition> {
  const validated = validateReportDefinitionPayload(input)
  if (!validated.ok) throw new TypeError(validated.error)
  await validateDefinitionAccess(userId, validated.value)
  const base = slugifyReportTitle(validated.value.title)
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = slugWithSuffix(base, suffix)
    const { data, error } = await supabaseAdmin.from("report_definitions").insert({ user_id: userId, slug, ...validated.value, authored_by: authoredBy }).select("*").single()
    if (!error && data) return data as ReportDefinition
    if (error?.code !== "23505") throw new Error(error?.message ?? "Definition could not be created")
  }
  throw new ReportDefinitionConflictError("A unique report slug could not be allocated")
}

export async function updateReportDefinition(userId: string, slug: string, input: unknown, expectedVersion: number, authoredBy: "user" | "assistant" = "user"): Promise<ReportDefinition> {
  const current = await getReportDefinition(userId, slug)
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("expectedVersion is required")
  if (current.version !== expectedVersion) throw new ReportDefinitionConflictError(`Report definition changed since version ${expectedVersion}`)
  const validated = validateReportDefinitionPayload({ ...current, ...(input && typeof input === "object" && !Array.isArray(input) ? input : {}) })
  if (!validated.ok) throw new TypeError(validated.error)
  await validateDefinitionAccess(userId, validated.value)
  const { data, error } = await supabaseAdmin.from("report_definitions").update({ ...validated.value, authored_by: authoredBy, version: expectedVersion + 1 }).eq("id", current.id).eq("user_id", userId).eq("version", expectedVersion).is("archived_at", null).select("*").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ReportDefinitionConflictError("Report definition changed while it was being saved")
  return data as ReportDefinition
}

export async function archiveReportDefinition(userId: string, slug: string): Promise<{ slug: string; archived_at: string }> {
  const archivedAt = new Date().toISOString()
  const { data, error } = await supabaseAdmin.from("report_definitions").update({ archived_at: archivedAt }).eq("user_id", userId).eq("slug", slug).is("archived_at", null).select("slug, archived_at").maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new ReportDefinitionNotFoundError("Report definition not found")
  return data as { slug: string; archived_at: string }
}

export function definitionInput(definition: ReportDefinition): ReportDefinitionInput {
  const { title, description, source, scope, period, filters, blocks, theme } = definition
  return { title, description, source, scope, period, filters, blocks, theme }
}
