import {
  validateReportDefinitionPayload,
  type MaterializedReportDefinitionSource,
  type ReportDefinitionScope,
} from "@/lib/report-definitions"

export const DATA_MAPPING_COERCIONS = ["identity", "trim", "number", "date", "boolean", "lowercase", "uppercase", "direction"] as const
export type DataMappingCoercion = typeof DATA_MAPPING_COERCIONS[number]

export const DATA_MAPPING_TARGET_FIELDS = [
  "occurred_on", "period_start", "period_end", "amount", "currency", "direction",
  "counterparty", "counterparty_normalized", "category", "description", "document_type",
  "record_type", "is_recurring",
] as const

export type DataMappingRule = {
  sourceField: string
  targetField: typeof DATA_MAPPING_TARGET_FIELDS[number]
  coercion: DataMappingCoercion
}

export type DataMappingProfileInput = {
  title: string
  description: string | null
  source: MaterializedReportDefinitionSource
  scope: ReportDefinitionScope | null
  mappings: DataMappingRule[]
}

export type DataMappingPreviewSummary = {
  profileVersion: number
  rowCount: number
  sourceMatches: number
  applied: number
  preserved: number
  conflicts: number
  typeFailures: number
  rules: Array<{ sourceField: string; targetField: string; sourceMatches: number; applied: number; preserved: number; conflicts: number; typeFailures: number }>
}

export type DataMappingProfile = DataMappingProfileInput & {
  id: string
  user_id: string
  slug: string
  status: "draft" | "active"
  authored_by: "user" | "assistant"
  version: number
  previewed_version: number | null
  preview_summary: DataMappingPreviewSummary | null
  activated_by: string | null
  activated_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type DataMappingProfileListItem = Pick<DataMappingProfile, "slug" | "title" | "description" | "source" | "mappings" | "status" | "authored_by" | "version" | "previewed_version" | "updated_at">

const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,199}$/
const TEXT_TARGETS = new Set(["counterparty", "counterparty_normalized", "category", "description", "document_type", "record_type"])

function allowedCoercion(target: string, coercion: DataMappingCoercion) {
  if (target === "amount") return coercion === "number"
  if (["occurred_on", "period_start", "period_end"].includes(target)) return coercion === "date"
  if (target === "is_recurring") return coercion === "boolean"
  if (target === "direction") return coercion === "direction"
  if (target === "currency") return coercion === "uppercase"
  return TEXT_TARGETS.has(target) && ["identity", "trim", "lowercase", "uppercase"].includes(coercion)
}

export function validateDataMappingProfilePayload(input: unknown): { ok: true; value: DataMappingProfileInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Mapping profile must be an object" }
  const candidate = input as Record<string, unknown>
  const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
  if (!title || title.length > 120) return { ok: false, error: "title is required and must be at most 120 characters" }
  if (!Array.isArray(candidate.mappings) || candidate.mappings.length < 1 || candidate.mappings.length > 50) return { ok: false, error: "mappings must contain 1–50 rules" }

  const mappings: DataMappingRule[] = []
  for (const [index, value] of candidate.mappings.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `mappings[${index}] must be an object` }
    const rule = value as Record<string, unknown>
    if (typeof rule.sourceField !== "string" || !FIELD_PATTERN.test(rule.sourceField)) return { ok: false, error: `mappings[${index}].sourceField is invalid` }
    if (!DATA_MAPPING_TARGET_FIELDS.includes(rule.targetField as DataMappingRule["targetField"])) return { ok: false, error: `mappings[${index}].targetField is not canonical` }
    if (!DATA_MAPPING_COERCIONS.includes(rule.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].coercion is unsupported` }
    if (rule.sourceField === rule.targetField) return { ok: false, error: `mappings[${index}] must map two different fields` }
    if (!allowedCoercion(String(rule.targetField), rule.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].coercion is incompatible with ${String(rule.targetField)}` }
    mappings.push({ sourceField: rule.sourceField, targetField: rule.targetField as DataMappingRule["targetField"], coercion: rule.coercion as DataMappingCoercion })
  }
  if (new Set(mappings.map((rule) => rule.sourceField)).size !== mappings.length) return { ok: false, error: "Each source field may be mapped once" }
  if (new Set(mappings.map((rule) => rule.targetField)).size !== mappings.length) return { ok: false, error: "Each canonical target may be mapped once" }
  const sourceFields = new Set(mappings.map((rule) => rule.sourceField))
  if (mappings.some((rule) => sourceFields.has(rule.targetField))) return { ok: false, error: "Mapping chains are not supported; every rule must read an original source field" }

  const sourceCheck = validateReportDefinitionPayload({
    title: "Data mapping",
    description: null,
    source: candidate.source,
    scope: candidate.scope ?? null,
    period: { kind: "all" },
    filters: [],
    blocks: [{ type: "table", title: "Source fields", columns: mappings.map((rule) => ({ field: rule.sourceField })), limit: 1 }],
    theme: null,
  })
  if (!sourceCheck.ok) return sourceCheck
  if (sourceCheck.value.source.kind !== "records" && sourceCheck.value.source.kind !== "dataset") return { ok: false, error: "Mapping profiles must directly reference records or datasets" }
  return {
    ok: true,
    value: {
      title,
      description: typeof candidate.description === "string" ? candidate.description.trim().slice(0, 500) || null : null,
      source: sourceCheck.value.source,
      scope: sourceCheck.value.scope,
      mappings,
    },
  }
}
