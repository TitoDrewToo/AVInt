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

export const RECONCILIATION_TARGET_TYPES = ["text", "number", "date", "boolean"] as const
export const RECONCILIATION_MISSING_POLICIES = ["null", "exclude_row", "exclude_dataset", "reject"] as const
export const RECONCILIATION_CONFLICT_POLICIES = ["reject", "first_non_empty"] as const
export const RECONCILIATION_FIELD_ROLES = ["time", "currency"] as const

export type CanonicalDataMappingTarget = typeof DATA_MAPPING_TARGET_FIELDS[number]
export type ReconciliationTargetType = typeof RECONCILIATION_TARGET_TYPES[number]
export type ReconciliationMissingPolicy = typeof RECONCILIATION_MISSING_POLICIES[number]
export type ReconciliationConflictPolicy = typeof RECONCILIATION_CONFLICT_POLICIES[number]
export type ReconciliationFieldRole = typeof RECONCILIATION_FIELD_ROLES[number]

export type LegacyDataMappingRule = {
  sourceField: string
  targetField: CanonicalDataMappingTarget
  coercion: DataMappingCoercion
}

export type ReconciliationDataMappingRule = {
  targetField: string
  targetType: ReconciliationTargetType
  candidates: Array<{ sourceField: string; coercion: DataMappingCoercion }>
  required: boolean
  onMissing: ReconciliationMissingPolicy
  onConflict: ReconciliationConflictPolicy
  role?: ReconciliationFieldRole
}

export type DataMappingRule = LegacyDataMappingRule | ReconciliationDataMappingRule

export type DataMappingProfileInput = {
  title: string
  description: string | null
  source: MaterializedReportDefinitionSource
  scope: ReportDefinitionScope | null
  mappings: DataMappingRule[]
}

export type DataMappingTargetPreview = {
  targetField: string
  targetType: ReconciliationTargetType
  datasetsPresent: number
  datasetsMissing: number
  valuesResolved: number
  valuesMissing: number
  typeFailures: number
  conflicts: number
}

export type DataMappingDatasetOutcome = {
  datasetId: string
  datasetName: string
  status: "included" | "excluded" | "blocked"
  reasons: string[]
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
  mode?: "reconciliation"
  sourceDatasets?: number
  includedDatasets?: number
  excludedDatasets?: number
  sourceRows?: number
  outputRows?: number
  excludedRows?: number
  activationReady?: boolean
  targets?: DataMappingTargetPreview[]
  datasetOutcomes?: DataMappingDatasetOutcome[]
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

export type DataMappingProfileListItem = Pick<DataMappingProfile, "slug" | "title" | "description" | "source" | "mappings" | "status" | "authored_by" | "version" | "previewed_version" | "preview_summary" | "updated_at">

const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,199}$/
const TEXT_TARGETS = new Set(["counterparty", "counterparty_normalized", "category", "description", "document_type", "record_type"])
const RESERVED_RECONCILIATION_TARGETS = new Set([
  "id", "user_id", "file_id", "dataset_id", "record_id", "extraction_id", "parent_record_id",
  "storage_path", "source_key", "status", "upload_status", "needs_review", "has_user_edits",
  "excluded_at", "created_at", "updated_at", "archived_at", "confidence", "field_confidence",
])

function allowedCoercion(target: string, coercion: DataMappingCoercion) {
  if (target === "amount") return coercion === "number"
  if (["occurred_on", "period_start", "period_end"].includes(target)) return coercion === "date"
  if (target === "is_recurring") return coercion === "boolean"
  if (target === "direction") return coercion === "direction"
  if (target === "currency") return coercion === "uppercase"
  return TEXT_TARGETS.has(target) && ["identity", "trim", "lowercase", "uppercase"].includes(coercion)
}

function allowedReconciliationCoercion(targetType: ReconciliationTargetType, coercion: DataMappingCoercion) {
  if (targetType === "number") return coercion === "number"
  if (targetType === "date") return coercion === "date"
  if (targetType === "boolean") return coercion === "boolean"
  return ["identity", "trim", "lowercase", "uppercase", "direction"].includes(coercion)
}

export function isReconciliationMappingRule(rule: DataMappingRule): rule is ReconciliationDataMappingRule {
  return "candidates" in rule
}

export function dataMappingRuleSourceFields(rule: DataMappingRule) {
  return isReconciliationMappingRule(rule) ? rule.candidates.map((candidate) => candidate.sourceField) : [rule.sourceField]
}

export function dataMappingTargetType(rule: DataMappingRule): ReconciliationTargetType {
  if (isReconciliationMappingRule(rule)) return rule.targetType
  if (rule.targetField === "amount") return "number"
  if (["occurred_on", "period_start", "period_end"].includes(rule.targetField)) return "date"
  if (rule.targetField === "is_recurring") return "boolean"
  return "text"
}

export function validateDataMappingProfilePayload(input: unknown): { ok: true; value: DataMappingProfileInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Mapping profile must be an object" }
  const candidate = input as Record<string, unknown>
  const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
  if (!title || title.length > 120) return { ok: false, error: "title is required and must be at most 120 characters" }
  if (!Array.isArray(candidate.mappings) || candidate.mappings.length < 1 || candidate.mappings.length > 50) return { ok: false, error: "mappings must contain 1–50 rules" }

  const ruleModes = candidate.mappings.map((value) => Boolean(value && typeof value === "object" && !Array.isArray(value) && "candidates" in value))
  if (ruleModes.some(Boolean) && ruleModes.some((mode) => !mode)) return { ok: false, error: "Legacy and reconciliation mapping rules cannot be mixed in one profile" }
  const reconciliation = ruleModes.every(Boolean)
  const mappings: DataMappingRule[] = []
  for (const [index, value] of candidate.mappings.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `mappings[${index}] must be an object` }
    const rule = value as Record<string, unknown>
    if (!reconciliation) {
      if (typeof rule.sourceField !== "string" || !FIELD_PATTERN.test(rule.sourceField)) return { ok: false, error: `mappings[${index}].sourceField is invalid` }
      if (!DATA_MAPPING_TARGET_FIELDS.includes(rule.targetField as CanonicalDataMappingTarget)) return { ok: false, error: `mappings[${index}].targetField is not canonical` }
      if (!DATA_MAPPING_COERCIONS.includes(rule.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].coercion is unsupported` }
      if (rule.sourceField === rule.targetField) return { ok: false, error: `mappings[${index}] must map two different fields` }
      if (!allowedCoercion(String(rule.targetField), rule.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].coercion is incompatible with ${String(rule.targetField)}` }
      mappings.push({ sourceField: rule.sourceField, targetField: rule.targetField as CanonicalDataMappingTarget, coercion: rule.coercion as DataMappingCoercion })
      continue
    }
    if (typeof rule.targetField !== "string" || !FIELD_PATTERN.test(rule.targetField) || rule.targetField.startsWith("__")) return { ok: false, error: `mappings[${index}].targetField is invalid` }
    if (RESERVED_RECONCILIATION_TARGETS.has(rule.targetField)) return { ok: false, error: `mappings[${index}].targetField is reserved` }
    if (!RECONCILIATION_TARGET_TYPES.includes(rule.targetType as ReconciliationTargetType)) return { ok: false, error: `mappings[${index}].targetType is unsupported` }
    if (typeof rule.required !== "boolean") return { ok: false, error: `mappings[${index}].required must be boolean` }
    if (!RECONCILIATION_MISSING_POLICIES.includes(rule.onMissing as ReconciliationMissingPolicy)) return { ok: false, error: `mappings[${index}].onMissing is unsupported` }
    if (rule.required && rule.onMissing === "null") return { ok: false, error: `mappings[${index}] cannot use null for a required target` }
    const onConflict = rule.onConflict === undefined ? "reject" : rule.onConflict
    if (!RECONCILIATION_CONFLICT_POLICIES.includes(onConflict as ReconciliationConflictPolicy)) return { ok: false, error: `mappings[${index}].onConflict is unsupported` }
    if (rule.role !== undefined && !RECONCILIATION_FIELD_ROLES.includes(rule.role as ReconciliationFieldRole)) return { ok: false, error: `mappings[${index}].role is unsupported` }
    if (rule.role === "time" && rule.targetType !== "date") return { ok: false, error: `mappings[${index}].time role requires a date target` }
    if (rule.role === "currency" && rule.targetType !== "text") return { ok: false, error: `mappings[${index}].currency role requires a text target` }
    if (!Array.isArray(rule.candidates) || rule.candidates.length < 1 || rule.candidates.length > 10) return { ok: false, error: `mappings[${index}].candidates must contain 1–10 fields` }
    const candidates: ReconciliationDataMappingRule["candidates"] = []
    for (const [candidateIndex, rawCandidate] of rule.candidates.entries()) {
      if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) return { ok: false, error: `mappings[${index}].candidates[${candidateIndex}] must be an object` }
      const source = rawCandidate as Record<string, unknown>
      if (typeof source.sourceField !== "string" || !FIELD_PATTERN.test(source.sourceField)) return { ok: false, error: `mappings[${index}].candidates[${candidateIndex}].sourceField is invalid` }
      if (!DATA_MAPPING_COERCIONS.includes(source.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].candidates[${candidateIndex}].coercion is unsupported` }
      if (!allowedReconciliationCoercion(rule.targetType as ReconciliationTargetType, source.coercion as DataMappingCoercion)) return { ok: false, error: `mappings[${index}].candidates[${candidateIndex}].coercion is incompatible with ${String(rule.targetType)}` }
      candidates.push({ sourceField: source.sourceField, coercion: source.coercion as DataMappingCoercion })
    }
    if (new Set(candidates.map((item) => item.sourceField)).size !== candidates.length) return { ok: false, error: `mappings[${index}].candidates must be unique` }
    mappings.push({ targetField: rule.targetField, targetType: rule.targetType as ReconciliationTargetType, candidates, required: rule.required, onMissing: rule.onMissing as ReconciliationMissingPolicy, onConflict: onConflict as ReconciliationConflictPolicy, ...(rule.role ? { role: rule.role as ReconciliationFieldRole } : {}) })
  }
  if (!reconciliation && new Set(mappings.map((rule) => (rule as LegacyDataMappingRule).sourceField)).size !== mappings.length) return { ok: false, error: "Each source field may be mapped once" }
  if (new Set(mappings.map((rule) => rule.targetField)).size !== mappings.length) return { ok: false, error: "Each target field may be mapped once" }
  const targetFields = new Set(mappings.map((rule) => rule.targetField))
  if (reconciliation && mappings.filter((rule) => isReconciliationMappingRule(rule) && rule.role === "time").length > 1) return { ok: false, error: "A reconciliation profile may declare at most one time field" }
  if (reconciliation && mappings.filter((rule) => isReconciliationMappingRule(rule) && rule.role === "currency").length > 1) return { ok: false, error: "A reconciliation profile may declare at most one currency field" }
  if (mappings.some((rule) => dataMappingRuleSourceFields(rule).some((sourceField) => sourceField !== rule.targetField && targetFields.has(sourceField)))) return { ok: false, error: "Mapping chains are not supported; every candidate must read an original source field" }

  const sourceCheck = validateReportDefinitionPayload({
    title: "Data mapping",
    description: null,
    source: candidate.source,
    scope: candidate.scope ?? null,
    period: { kind: "all" },
    filters: [],
    // Reconciliation candidates can legitimately exceed the report table's
    // 20-column presentation limit. Their fields are checked against the
    // heterogeneous source during preview instead of being smuggled through
    // a synthetic table block here.
    blocks: reconciliation
      ? [{ type: "stat", title: "Source rows", metric: { aggregation: "count" } }]
      : [{ type: "table", title: "Source fields", columns: [...new Set(mappings.flatMap(dataMappingRuleSourceFields))].map((field) => ({ field })), limit: 1 }],
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
