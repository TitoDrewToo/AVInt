import { supabaseAdmin } from "@/lib/mcp-auth"
import { RECORD_DEFINITION_FIELDS, referencedDefinitionFields, slugifyReportTitle, slugWithSuffix, validateReportDefinitionPayload, type ReportDefinition, type ReportDefinitionInput, type ReportDefinitionListItem, type ReportMetric } from "@/lib/report-definitions"
import { resolveReportFolderScope } from "@/lib/report-folder-scope-server"

export class ReportDefinitionNotFoundError extends Error {}
export class ReportDefinitionConflictError extends Error {}

function metrics(input: ReportDefinitionInput): ReportMetric[] {
  return input.blocks.flatMap((block) => block.type === "kpi" ? block.items.map((item) => item.metric) : block.type === "share" || block.type === "stat" ? [block.metric] : [])
}

async function validateDefinitionAccess(userId: string, input: ReportDefinitionInput) {
  if (input.scope?.folderId) await resolveReportFolderScope(userId, input.scope.folderId)
  const referenced = referencedDefinitionFields(input)
  if (input.source.kind === "records") {
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
    const invalidMetric = metrics(input).find((metric) => metric.aggregation !== "count" && metric.field && !numericCore.has(metric.field) && !types.get(metric.field)?.has("number"))
    if (invalidMetric?.field) throw new TypeError(`${invalidMetric.field} is not a numeric field and cannot use ${invalidMetric.aggregation}`)
    return
  }
  const { data: dataset, error } = await supabaseAdmin.from("datasets").select("id, file_id").eq("id", input.source.datasetId).eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!dataset) throw new TypeError("The selected dataset does not exist or is not accessible")
  if (input.scope?.folderId) {
    const { data: file } = await supabaseAdmin.from("files").select("folder_id").eq("id", dataset.file_id).eq("user_id", userId).maybeSingle()
    const scope = await resolveReportFolderScope(userId, input.scope.folderId)
    if (!file || !scope?.folderIds.includes(file.folder_id)) throw new TypeError("The selected dataset is outside the report folder scope")
  }
  const { data: columns, error: columnError } = await supabaseAdmin.from("dataset_columns").select("key, data_type").eq("dataset_id", dataset.id).eq("user_id", userId)
  if (columnError) throw new Error(columnError.message)
  const typeByField = new Map((columns ?? []).map((column) => [column.key, column.data_type]))
  const unknown = referenced.filter((field) => !typeByField.has(field))
  if (unknown.length) throw new TypeError(`Definition references unavailable dataset fields: ${unknown.join(", ")}`)
  if (input.source.dateField && typeByField.get(input.source.dateField) !== "date") throw new TypeError("source.dateField must reference a date column")
  if (input.source.currencyField && typeByField.get(input.source.currencyField) !== "text") throw new TypeError("source.currencyField must reference a text column")
  const invalidMetric = metrics(input).find((metric) => metric.aggregation !== "count" && metric.field && typeByField.get(metric.field) !== "number")
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
