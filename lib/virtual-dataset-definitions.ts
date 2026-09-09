import {
  validateReportDefinitionPayload,
  type ReusableReportDefinitionSource,
  type ReportDefinitionFilter,
  type ReportDefinitionScope,
} from "@/lib/report-definitions"

export type VirtualDatasetDefinitionInput = {
  title: string
  description: string | null
  source: ReusableReportDefinitionSource
  scope: ReportDefinitionScope | null
  filters: ReportDefinitionFilter[]
  fields: string[]
}

export type VirtualDatasetDefinition = VirtualDatasetDefinitionInput & {
  id: string
  user_id: string
  slug: string
  authored_by: "user" | "assistant"
  version: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type VirtualDatasetDefinitionListItem = Pick<VirtualDatasetDefinition, "slug" | "title" | "description" | "source" | "fields" | "authored_by" | "version" | "updated_at">

export function validateVirtualDatasetDefinitionPayload(input: unknown): { ok: true; value: VirtualDatasetDefinitionInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Virtual dataset definition must be an object" }
  const candidate = input as Record<string, unknown>
  if (!Array.isArray(candidate.fields) || candidate.fields.length < 1 || candidate.fields.length > 100) return { ok: false, error: "fields must contain 1–100 field names" }
  const fields = candidate.fields.map((field) => typeof field === "string" ? field : "")
  if (new Set(fields).size !== fields.length) return { ok: false, error: "fields must be unique" }
  if (!candidate.source || typeof candidate.source !== "object" || Array.isArray(candidate.source) || (candidate.source as { kind?: unknown }).kind === "virtual_dataset") {
    return { ok: false, error: "A virtual dataset must reference records, datasets, or a mapping profile; nested virtual datasets are not supported" }
  }
  const validated = validateReportDefinitionPayload({
    title: "Virtual dataset",
    description: candidate.description ?? null,
    source: candidate.source,
    scope: candidate.scope ?? null,
    period: { kind: "all" },
    filters: candidate.filters ?? [],
    blocks: [{ type: "table", title: "Projected fields", columns: fields.map((field) => ({ field })), limit: 1 }],
    theme: null,
  })
  if (!validated.ok) return validated
  if (validated.value.source.kind === "virtual_dataset") return { ok: false, error: "Nested virtual datasets are not supported" }
  const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
  if (!title || title.length > 120) return { ok: false, error: "title is required and must be at most 120 characters" }
  return {
    ok: true,
    value: {
      title,
      description: validated.value.description,
      source: validated.value.source,
      scope: validated.value.scope,
      filters: validated.value.filters,
      fields,
    },
  }
}
