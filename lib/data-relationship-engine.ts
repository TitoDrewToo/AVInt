import { relationshipOutputField, type DataRelationshipDefinition, type DataRelationshipPreviewSamples, type DataRelationshipPreviewSummary } from "@/lib/data-relationship-definitions"
import type { LoadedReportDefinitionSource } from "@/lib/report-definition-engine"

export const DATA_RELATIONSHIP_ROW_LIMIT = 5_000
type ValueRow = Record<string, unknown>

export class DataRelationshipExecutionError extends Error {}

function usableKey(value: unknown) {
  return (typeof value === "string" && value.trim() !== "") || (typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean"
}

function typedKey(value: string | number | boolean) {
  return `${typeof value}:${String(value)}`
}

function indexRows(rows: ValueRow[], field: string) {
  const index = new Map<string, ValueRow[]>()
  const display = new Map<string, string>()
  let nullKeys = 0
  for (const row of rows) {
    const raw = row[field]
    if (!usableKey(raw)) { nullKeys += 1; continue }
    const key = typedKey(raw as string | number | boolean)
    display.set(key, String(raw))
    const values = index.get(key) ?? []
    values.push(row)
    index.set(key, values)
  }
  return { index, display, nullKeys }
}

function namespaced(row: ValueRow, side: "left" | "right") {
  return Object.fromEntries(Object.entries(row).map(([field, value]) => [field.startsWith("__") ? `__${side}_${field.slice(2)}` : relationshipOutputField(side, field), value]))
}

export function applyDataRelationship(definition: DataRelationshipDefinition, left: LoadedReportDefinitionSource, right: LoadedReportDefinitionSource): { source: LoadedReportDefinitionSource; preview: DataRelationshipPreviewSummary; samples: DataRelationshipPreviewSamples } {
  if (!left.availableFields.has(definition.leftKey) || !right.availableFields.has(definition.rightKey)) throw new DataRelationshipExecutionError("A relationship key is no longer available in its virtual dataset")
  if (definition.dateField) {
    const selected = definition.dateField.side === "left" ? left : right
    if (selected.dateField !== definition.dateField.field) throw new DataRelationshipExecutionError("dateField must reference the declared date field of its virtual dataset")
  }
  if (definition.currencyField) {
    const selected = definition.currencyField.side === "left" ? left : right
    if (selected.currencyField !== definition.currencyField.field) throw new DataRelationshipExecutionError("currencyField must reference the declared currency field of its virtual dataset")
  }
  const leftIndexed = indexRows(left.rows, definition.leftKey)
  const rightIndexed = indexRows(right.rows, definition.rightKey)
  const leftDuplicateKeys = [...leftIndexed.index.values()].filter((rows) => rows.length > 1).length
  const rightDuplicateKeys = [...rightIndexed.index.values()].filter((rows) => rows.length > 1).length
  const cardinalityValid = definition.cardinality === "one_to_one"
    ? leftDuplicateKeys === 0 && rightDuplicateKeys === 0
    : definition.cardinality === "one_to_many" ? leftDuplicateKeys === 0 : rightDuplicateKeys === 0
  const matchedKeys = [...leftIndexed.index.keys()].filter((key) => rightIndexed.index.has(key))
  const samples: DataRelationshipPreviewSamples = {
    leftUnmatchedKeys: [...leftIndexed.index.keys()].filter((key) => !rightIndexed.index.has(key)).slice(0, 10).map((key) => leftIndexed.display.get(key)!),
    rightUnmatchedKeys: [...rightIndexed.index.keys()].filter((key) => !leftIndexed.index.has(key)).slice(0, 10).map((key) => rightIndexed.display.get(key)!),
    leftDuplicateKeys: [...leftIndexed.index].filter(([, rows]) => rows.length > 1).map(([key]) => leftIndexed.display.get(key)!).slice(0, 10),
    rightDuplicateKeys: [...rightIndexed.index].filter(([, rows]) => rows.length > 1).map(([key]) => rightIndexed.display.get(key)!).slice(0, 10),
  }
  const leftMatchedRows = matchedKeys.reduce((sum, key) => sum + leftIndexed.index.get(key)!.length, 0)
  const rightMatchedRows = matchedKeys.reduce((sum, key) => sum + rightIndexed.index.get(key)!.length, 0)
  const projectedRows = matchedKeys.reduce((sum, key) => sum + leftIndexed.index.get(key)!.length * rightIndexed.index.get(key)!.length, 0)
  const leftNonNullRows = left.rows.length - leftIndexed.nullKeys
  const rightNonNullRows = right.rows.length - rightIndexed.nullKeys
  const preview: DataRelationshipPreviewSummary = {
    relationshipVersion: definition.version,
    cardinalityValid,
    leftRows: left.rows.length,
    rightRows: right.rows.length,
    leftNullKeys: leftIndexed.nullKeys,
    rightNullKeys: rightIndexed.nullKeys,
    leftDuplicateKeys,
    rightDuplicateKeys,
    leftMatchedRows,
    rightMatchedRows,
    leftUnmatchedRows: leftNonNullRows - leftMatchedRows,
    rightUnmatchedRows: rightNonNullRows - rightMatchedRows,
    matchedKeys: matchedKeys.length,
    projectedRows,
    matchRate: leftNonNullRows ? Number((leftMatchedRows / leftNonNullRows).toFixed(4)) : 0,
    withinRowLimit: projectedRows <= DATA_RELATIONSHIP_ROW_LIMIT,
  }
  if (!cardinalityValid) throw Object.assign(new DataRelationshipExecutionError(`The current rows violate declared ${definition.cardinality} cardinality`), { preview })
  if (projectedRows > DATA_RELATIONSHIP_ROW_LIMIT) throw Object.assign(new DataRelationshipExecutionError(`The relationship would produce ${projectedRows} rows, above the ${DATA_RELATIONSHIP_ROW_LIMIT}-row limit`), { preview })
  const rows = matchedKeys.flatMap((key) => leftIndexed.index.get(key)!.flatMap((leftRow) => rightIndexed.index.get(key)!.map((rightRow) => ({
    ...namespaced(leftRow, "left"),
    ...namespaced(rightRow, "right"),
    __relationship_slug: definition.slug,
    __relationship_version: definition.version,
  }))))
  const availableFields = new Set<string>([
    ...[...left.availableFields].map((field) => relationshipOutputField("left", field)),
    ...[...right.availableFields].map((field) => relationshipOutputField("right", field)),
  ])
  const fieldTypes = new Map<string, string>([
    ...[...(left.fieldTypes ?? new Map<string, string>())].map(([field, type]) => [relationshipOutputField("left", field), type] as [string, string]),
    ...[...(right.fieldTypes ?? new Map<string, string>())].map(([field, type]) => [relationshipOutputField("right", field), type] as [string, string]),
  ])
  const dateField = definition.dateField ? relationshipOutputField(definition.dateField.side, definition.dateField.field) : null
  const currencyField = definition.currencyField ? relationshipOutputField(definition.currencyField.side, definition.currencyField.field) : null
  const coverageNote = `Relationship ${definition.slug} v${definition.version} matched ${leftMatchedRows}/${leftNonNullRows} left rows (${(preview.matchRate * 100).toFixed(1)}%); omitted ${preview.leftUnmatchedRows} unmatched left, ${preview.rightUnmatchedRows} unmatched right, ${preview.leftNullKeys + preview.rightNullKeys} null-key row(s); produced ${projectedRows} inner-join row(s) without de-duplication. ${left.coverageNote ?? ""} ${right.coverageNote ?? ""}`.trim()
  return { source: { rows, availableFields, fieldTypes, dateField, currencyField, sourceLabel: `relationship ${definition.title}`, coverageNote }, preview, samples }
}
