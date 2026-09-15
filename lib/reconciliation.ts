import { z } from "zod"

const field = z.string().regex(/^[a-z][a-z0-9_]{0,199}$/)
const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/)
const comparison = z.object({
  leftField: field,
  rightField: field,
  kind: z.enum(["exact", "numeric_tolerance", "date", "normalized_text"]),
  tolerance: z.number().finite().min(0).max(1_000_000).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "numeric_tolerance" && value.tolerance === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "numeric_tolerance requires tolerance" })
})

export const reconciliationInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  sourceADatasetId: z.string().uuid(),
  sourceBDatasetId: z.string().uuid(),
  keyFields: z.array(field).min(1).max(5),
  comparisons: z.array(comparison).min(1).max(30),
}).strict().superRefine((value, ctx) => {
  if (value.sourceADatasetId === value.sourceBDatasetId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceBDatasetId"], message: "Sources must be different datasets" })
  if (new Set(value.keyFields).size !== value.keyFields.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyFields"], message: "Key fields must be unique" })
})

export const reconciliationDefinitionSchema = reconciliationInputSchema.extend({ slug: slug.optional() })
export type ReconciliationInput = z.infer<typeof reconciliationInputSchema>
export type ReconciliationComparison = z.infer<typeof comparison>

export type EvidenceRow = {
  datasetId: string
  fileId: string
  filename: string
  rowIndex: number
  values: Record<string, unknown>
  rawValues: Record<string, unknown>
}

export type ReconciliationResult = {
  summary: {
    sourceARows: number
    sourceBRows: number
    matched: number
    missingFromA: number
    missingFromB: number
    duplicates: number
    conflicts: number
    reconciliationRate: number
  }
  discrepancies: Array<{
    classification: "missing_from_a" | "missing_from_b" | "duplicate" | "conflict"
    key: Record<string, unknown>
    sourceA: EvidenceRow | null
    sourceB: EvidenceRow | null
    fieldDifferences: Array<{ leftField: string; rightField: string; left: unknown; right: unknown; difference?: number; kind: ReconciliationComparison["kind"] }>
    severity: "low" | "medium" | "high"
  }>
}

function present(value: unknown) { return value !== null && value !== undefined && String(value).trim() !== "" }
function keyFor(row: Record<string, unknown>, fields: string[]) { return fields.map((field) => String(row[field] ?? "").trim()).join("\u001f") }
function equal(left: unknown, right: unknown, rule: ReconciliationComparison) {
  if (!present(left) || !present(right)) return left === right
  if (rule.kind === "numeric_tolerance") {
    const a = Number(left); const b = Number(right)
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= (rule.tolerance ?? 0)
  }
  if (rule.kind === "normalized_text") return String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
  if (rule.kind === "date") return String(left).slice(0, 10) === String(right).slice(0, 10)
  return String(left) === String(right)
}

export function reconcileRows(input: ReconciliationInput, sourceA: EvidenceRow[], sourceB: EvidenceRow[]): ReconciliationResult {
  const map = (rows: EvidenceRow[]) => {
    const result = new Map<string, EvidenceRow[]>()
    for (const row of rows) { const key = keyFor(row.values, input.keyFields); result.set(key, [...(result.get(key) ?? []), row]) }
    return result
  }
  const left = map(sourceA); const right = map(sourceB)
  const keys = [...new Set([...left.keys(), ...right.keys()])]
  const discrepancies: ReconciliationResult["discrepancies"] = []
  let matched = 0; let duplicates = 0; let conflicts = 0
  for (const encoded of keys) {
    const leftRows = left.get(encoded) ?? []; const rightRows = right.get(encoded) ?? []
    const key = Object.fromEntries(input.keyFields.map((field, index) => [field, encoded.split("\u001f")[index] ?? ""]))
    if (leftRows.length > 1 || rightRows.length > 1) {
      duplicates += Math.max(leftRows.length - 1, 0) + Math.max(rightRows.length - 1, 0)
      discrepancies.push({ classification: "duplicate", key, sourceA: leftRows[0] ?? null, sourceB: rightRows[0] ?? null, fieldDifferences: [], severity: "high" })
      continue
    }
    if (!leftRows.length) { discrepancies.push({ classification: "missing_from_a", key, sourceA: null, sourceB: rightRows[0], fieldDifferences: [], severity: "high" }); continue }
    if (!rightRows.length) { discrepancies.push({ classification: "missing_from_b", key, sourceA: leftRows[0], sourceB: null, fieldDifferences: [], severity: "high" }); continue }
    const fieldDifferences = input.comparisons.filter((rule) => !equal(leftRows[0].values[rule.leftField], rightRows[0].values[rule.rightField], rule)).map((rule) => {
      const leftValue = leftRows[0].values[rule.leftField]; const rightValue = rightRows[0].values[rule.rightField]
      const a = Number(leftValue); const b = Number(rightValue)
      return { leftField: rule.leftField, rightField: rule.rightField, left: leftValue, right: rightValue, ...(Number.isFinite(a) && Number.isFinite(b) ? { difference: a - b } : {}), kind: rule.kind }
    })
    if (fieldDifferences.length) { conflicts += 1; discrepancies.push({ classification: "conflict", key, sourceA: leftRows[0], sourceB: rightRows[0], fieldDifferences, severity: fieldDifferences.some((field) => Math.abs(field.difference ?? 0) > 1000) ? "high" : "medium" }) }
    else matched += 1
  }
  const comparable = Math.max(sourceA.length, sourceB.length, 1)
  return { summary: { sourceARows: sourceA.length, sourceBRows: sourceB.length, matched, missingFromA: discrepancies.filter((item) => item.classification === "missing_from_a").length, missingFromB: discrepancies.filter((item) => item.classification === "missing_from_b").length, duplicates, conflicts, reconciliationRate: Number((matched / comparable).toFixed(4)) }, discrepancies }
}
