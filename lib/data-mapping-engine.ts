import type { DataMappingProfile, DataMappingPreviewSummary, DataMappingRule } from "@/lib/data-mapping-definitions"

type ValueRow = Record<string, unknown>
type MappingSource = { rows: ValueRow[]; availableFields: Set<string>; dateField: string | null; currencyField: string | null; sourceLabel: string; coverageNote?: string }
export type DataMappingPreview = DataMappingPreviewSummary & {
  samples: Array<{ sourceField: string; targetField: string; before: unknown; after: unknown; outcome: "applied" | "preserved" | "conflict" | "type_failure" }>
}

function present(value: unknown) { return value !== null && value !== undefined && value !== "" }
function realDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function coerce(value: unknown, rule: DataMappingRule): { ok: true; value: unknown } | { ok: false } {
  if (!present(value)) return { ok: false }
  if (rule.coercion === "identity") return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? { ok: true, value } : { ok: false }
  const text = String(value).trim()
  if (rule.coercion === "trim") return text ? { ok: true, value: text } : { ok: false }
  if (rule.coercion === "lowercase") return text ? { ok: true, value: text.toLowerCase() } : { ok: false }
  if (rule.coercion === "uppercase") return text ? { ok: true, value: text.toUpperCase() } : { ok: false }
  if (rule.coercion === "date") return realDate(text) ? { ok: true, value: realDate(text)! } : { ok: false }
  if (rule.coercion === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false }
    if (!/^[+-]?(?:\d+(?:,\d{3})*|\d*)(?:\.\d+)?$/.test(text) || !/\d/.test(text)) return { ok: false }
    const parsed = Number(text.replaceAll(",", ""))
    return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false }
  }
  if (rule.coercion === "boolean") {
    if (typeof value === "boolean") return { ok: true, value }
    if (["true", "yes", "1"].includes(text.toLowerCase())) return { ok: true, value: true }
    if (["false", "no", "0"].includes(text.toLowerCase())) return { ok: true, value: false }
    return { ok: false }
  }
  const direction = text.toLowerCase()
  if (["inflow", "in", "income", "credit", "cr"].includes(direction)) return { ok: true, value: "inflow" }
  if (["outflow", "out", "expense", "debit", "dr"].includes(direction)) return { ok: true, value: "outflow" }
  if (["neutral", "none"].includes(direction)) return { ok: true, value: "neutral" }
  return { ok: false }
}

export function applyDataMappingProfile(profile: Pick<DataMappingProfile, "slug" | "version" | "mappings">, source: MappingSource): { source: MappingSource; preview: DataMappingPreview } {
  const ruleStats = new Map(profile.mappings.map((rule) => [rule.sourceField, { sourceField: rule.sourceField, targetField: rule.targetField, sourceMatches: 0, applied: 0, preserved: 0, conflicts: 0, typeFailures: 0 }]))
  const samples: DataMappingPreview["samples"] = []
  const rows = source.rows.map((original) => {
    const row = { ...original }
    const issues: Array<{ sourceField: string; targetField: string; reason: string }> = []
    for (const rule of profile.mappings) {
      const before = original[rule.sourceField]
      if (!present(before)) continue
      const stats = ruleStats.get(rule.sourceField)!
      stats.sourceMatches += 1
      const converted = coerce(before, rule)
      if (!converted.ok) {
        stats.typeFailures += 1
        issues.push({ sourceField: rule.sourceField, targetField: rule.targetField, reason: "type_failure" })
        if (samples.filter((sample) => sample.sourceField === rule.sourceField).length < 3) samples.push({ sourceField: rule.sourceField, targetField: rule.targetField, before, after: null, outcome: "type_failure" })
        continue
      }
      const existing = original[rule.targetField]
      if (present(existing)) {
        if (String(existing) === String(converted.value)) stats.preserved += 1
        else { stats.conflicts += 1; issues.push({ sourceField: rule.sourceField, targetField: rule.targetField, reason: "canonical_value_preserved" }) }
        const outcome = String(existing) === String(converted.value) ? "preserved" : "conflict"
        if (samples.filter((sample) => sample.sourceField === rule.sourceField).length < 3) samples.push({ sourceField: rule.sourceField, targetField: rule.targetField, before, after: existing, outcome })
        continue
      }
      row[rule.targetField] = converted.value
      stats.applied += 1
      if (samples.filter((sample) => sample.sourceField === rule.sourceField).length < 3) samples.push({ sourceField: rule.sourceField, targetField: rule.targetField, before, after: converted.value, outcome: "applied" })
    }
    if (issues.length) row.__mapping_issues = issues
    row.__mapping_profile = profile.slug
    row.__mapping_profile_version = profile.version
    return row
  })
  const rules = [...ruleStats.values()]
  const totals = (key: "sourceMatches" | "applied" | "preserved" | "conflicts" | "typeFailures") => rules.reduce((sum, rule) => sum + rule[key], 0)
  const preview: DataMappingPreview = { profileVersion: profile.version, rowCount: rows.length, sourceMatches: totals("sourceMatches"), applied: totals("applied"), preserved: totals("preserved"), conflicts: totals("conflicts"), typeFailures: totals("typeFailures"), rules, samples }
  const note = `Mapping profile ${profile.slug} v${profile.version}: ${preview.applied} value(s) mapped, ${preview.preserved} canonical value(s) preserved${preview.conflicts ? `, ${preview.conflicts} conflict(s)` : ""}${preview.typeFailures ? `, ${preview.typeFailures} type failure(s)` : ""}.`
  const mappedTargets = new Set(profile.mappings.map((rule) => rule.targetField))
  return {
    source: {
      ...source,
      rows,
      availableFields: new Set([...source.availableFields, ...profile.mappings.map((rule) => rule.targetField)]),
      dateField: source.dateField ?? (mappedTargets.has("occurred_on") ? "occurred_on" : mappedTargets.has("period_start") ? "period_start" : null),
      currencyField: source.currencyField ?? (mappedTargets.has("currency") ? "currency" : null),
      sourceLabel: `mapped ${source.sourceLabel}`,
      coverageNote: source.coverageNote ? `${note} ${source.coverageNote}` : note,
    },
    preview,
  }
}
