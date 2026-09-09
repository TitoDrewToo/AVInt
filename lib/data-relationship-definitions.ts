export const DATA_RELATIONSHIP_CARDINALITIES = ["one_to_one", "one_to_many", "many_to_one"] as const
export type DataRelationshipCardinality = typeof DATA_RELATIONSHIP_CARDINALITIES[number]
export type DataRelationshipSide = "left" | "right"

export type DataRelationshipField = { side: DataRelationshipSide; field: string }
export type DataRelationshipDefinitionInput = {
  title: string
  description: string | null
  leftVirtualDatasetSlug: string
  rightVirtualDatasetSlug: string
  leftKey: string
  rightKey: string
  cardinality: DataRelationshipCardinality
  dateField?: DataRelationshipField
  currencyField?: DataRelationshipField
}

export type DataRelationshipPreviewSummary = {
  relationshipVersion: number
  cardinalityValid: boolean
  leftRows: number
  rightRows: number
  leftNullKeys: number
  rightNullKeys: number
  leftDuplicateKeys: number
  rightDuplicateKeys: number
  leftMatchedRows: number
  rightMatchedRows: number
  leftUnmatchedRows: number
  rightUnmatchedRows: number
  matchedKeys: number
  projectedRows: number
  matchRate: number
  withinRowLimit: boolean
}
export type DataRelationshipPreviewSamples = {
  leftUnmatchedKeys: string[]
  rightUnmatchedKeys: string[]
  leftDuplicateKeys: string[]
  rightDuplicateKeys: string[]
}

export type DataRelationshipDefinition = DataRelationshipDefinitionInput & {
  id: string
  user_id: string
  slug: string
  status: "draft" | "active"
  authored_by: "user" | "assistant"
  version: number
  previewed_version: number | null
  preview_summary: DataRelationshipPreviewSummary | null
  activated_by: string | null
  activated_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type DataRelationshipDefinitionListItem = Pick<DataRelationshipDefinition, "slug" | "title" | "description" | "leftVirtualDatasetSlug" | "rightVirtualDatasetSlug" | "leftKey" | "rightKey" | "cardinality" | "status" | "version" | "previewed_version" | "updated_at">

const FIELD_PATTERN = /^[a-z][a-z0-9_]{0,199}$/
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/

function optionalField(value: unknown, path: string): { ok: true; value?: DataRelationshipField } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `${path} must name a side and field` }
  const candidate = value as Record<string, unknown>
  if ((candidate.side !== "left" && candidate.side !== "right") || typeof candidate.field !== "string" || !FIELD_PATTERN.test(candidate.field)) return { ok: false, error: `${path} must name a valid left or right field` }
  return { ok: true, value: { side: candidate.side, field: candidate.field } }
}

export function relationshipOutputField(side: DataRelationshipSide, field: string) {
  return `${side}_${field}`
}

export function validateDataRelationshipDefinitionPayload(input: unknown): { ok: true; value: DataRelationshipDefinitionInput } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "Relationship definition must be an object" }
  const candidate = input as Record<string, unknown>
  const title = typeof candidate.title === "string" ? candidate.title.trim() : ""
  if (!title || title.length > 120) return { ok: false, error: "title is required and must be at most 120 characters" }
  const leftSlug = typeof candidate.leftVirtualDatasetSlug === "string" ? candidate.leftVirtualDatasetSlug : ""
  const rightSlug = typeof candidate.rightVirtualDatasetSlug === "string" ? candidate.rightVirtualDatasetSlug : ""
  if (!SLUG_PATTERN.test(leftSlug) || !SLUG_PATTERN.test(rightSlug)) return { ok: false, error: "Both virtual dataset slugs must be valid" }
  if (leftSlug === rightSlug) return { ok: false, error: "A relationship must join two different virtual datasets" }
  if (typeof candidate.leftKey !== "string" || !FIELD_PATTERN.test(candidate.leftKey) || typeof candidate.rightKey !== "string" || !FIELD_PATTERN.test(candidate.rightKey)) return { ok: false, error: "leftKey and rightKey must be valid named fields" }
  if (!DATA_RELATIONSHIP_CARDINALITIES.includes(candidate.cardinality as DataRelationshipCardinality)) return { ok: false, error: "cardinality must be one_to_one, one_to_many, or many_to_one" }
  const dateField = optionalField(candidate.dateField, "dateField")
  if (!dateField.ok) return dateField
  const currencyField = optionalField(candidate.currencyField, "currencyField")
  if (!currencyField.ok) return currencyField
  return {
    ok: true,
    value: {
      title,
      description: typeof candidate.description === "string" ? candidate.description.trim().slice(0, 500) || null : null,
      leftVirtualDatasetSlug: leftSlug,
      rightVirtualDatasetSlug: rightSlug,
      leftKey: candidate.leftKey,
      rightKey: candidate.rightKey,
      cardinality: candidate.cardinality as DataRelationshipCardinality,
      ...(dateField.value ? { dateField: dateField.value } : {}),
      ...(currencyField.value ? { currencyField: currencyField.value } : {}),
    },
  }
}
