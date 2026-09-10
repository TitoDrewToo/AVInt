import {
  DATA_MAPPING_TARGET_FIELDS,
  dataMappingTargetType,
  isReconciliationMappingRule,
  type DataMappingDatasetOutcome,
  type DataMappingCoercion,
  type DataMappingProfile,
  type DataMappingPreviewSummary,
  type DataMappingTargetPreview,
  type LegacyDataMappingRule,
  type ReconciliationDataMappingRule,
} from "@/lib/data-mapping-definitions"

type ValueRow = Record<string, unknown>
export type MappingDatasetSchema = { datasetId: string; datasetName: string; fields: Array<{ key: string; dataType: string }> }
export type MappingSource = {
  rows: ValueRow[]
  availableFields: Set<string>
  fieldTypes?: Map<string, string>
  datasetSchemas?: MappingDatasetSchema[]
  dependencies?: Array<{ kind: "file" | "dataset" | "mapping_profile" | "virtual_dataset" | "relationship"; id: string; version?: number | string }>
  dateField: string | null
  currencyField: string | null
  sourceLabel: string
  coverageNote?: string
}
export type DataMappingPreview = DataMappingPreviewSummary & {
  samples: Array<{ sourceField: string; targetField: string; before: unknown; after: unknown; outcome: "applied" | "preserved" | "conflict" | "type_failure" }>
}

function present(value: unknown) { return value !== null && value !== undefined && value !== "" }
function realDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null
}

function coerce(value: unknown, coercion: DataMappingCoercion): { ok: true; value: unknown } | { ok: false } {
  if (!present(value)) return { ok: false }
  if (coercion === "identity") return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? { ok: true, value } : { ok: false }
  const text = String(value).trim()
  if (coercion === "trim") return text ? { ok: true, value: text } : { ok: false }
  if (coercion === "lowercase") return text ? { ok: true, value: text.toLowerCase() } : { ok: false }
  if (coercion === "uppercase") return text ? { ok: true, value: text.toUpperCase() } : { ok: false }
  if (coercion === "date") return realDate(text) ? { ok: true, value: realDate(text)! } : { ok: false }
  if (coercion === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? { ok: true, value } : { ok: false }
    if (!/^[+-]?(?:\d+(?:,\d{3})*|\d*)(?:\.\d+)?$/.test(text) || !/\d/.test(text)) return { ok: false }
    const parsed = Number(text.replaceAll(",", ""))
    return Number.isFinite(parsed) ? { ok: true, value: parsed } : { ok: false }
  }
  if (coercion === "boolean") {
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

function applyLegacyDataMappingProfile(profile: Pick<DataMappingProfile, "slug" | "version"> & { mappings: LegacyDataMappingRule[] }, source: MappingSource): { source: MappingSource; preview: DataMappingPreview } {
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
      const converted = coerce(before, rule.coercion)
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

function targetValue(value: unknown, rule: ReconciliationDataMappingRule) {
  if (rule.targetType === "text") return { ok: true as const, value: String(value) }
  if (rule.targetType === "number") return typeof value === "number" && Number.isFinite(value) ? { ok: true as const, value } : { ok: false as const }
  if (rule.targetType === "boolean") return typeof value === "boolean" ? { ok: true as const, value } : { ok: false as const }
  return typeof value === "string" && realDate(value) ? { ok: true as const, value } : { ok: false as const }
}

function sameValue(left: unknown, right: unknown) {
  return typeof left === typeof right && String(left) === String(right)
}

function applyReconciliationProfile(profile: Pick<DataMappingProfile, "slug" | "version"> & { mappings: ReconciliationDataMappingRule[] }, source: MappingSource): { source: MappingSource; preview: DataMappingPreview } {
  const canonicalTargets = new Set<string>(DATA_MAPPING_TARGET_FIELDS)
  const schemas = source.datasetSchemas?.length
    ? source.datasetSchemas
    : [{ datasetId: "records", datasetName: "Canonical records", fields: [...source.availableFields].map((key) => ({ key, dataType: source.fieldTypes?.get(key) ?? "unknown" })) }]
  const excludedDatasets = new Set<string>()
  const blockedDatasets = new Set<string>()
  const datasetReasons = new Map<string, Set<string>>()
  const noteDataset = (datasetId: string, reason: string) => {
    const reasons = datasetReasons.get(datasetId) ?? new Set<string>()
    reasons.add(reason)
    datasetReasons.set(datasetId, reasons)
  }
  const targets = new Map<string, DataMappingTargetPreview>(profile.mappings.map((rule) => [rule.targetField, {
    targetField: rule.targetField, targetType: rule.targetType, datasetsPresent: 0, datasetsMissing: 0,
    valuesResolved: 0, valuesMissing: 0, typeFailures: 0, conflicts: 0,
  }]))
  let activationReady = true
  for (const schema of schemas) {
    const fields = new Set(schema.fields.map((field) => field.key))
    for (const rule of profile.mappings) {
      const stat = targets.get(rule.targetField)!
      if (rule.candidates.some((candidate) => fields.has(candidate.sourceField))) {
        stat.datasetsPresent += 1
        continue
      }
      stat.datasetsMissing += 1
      const reason = `${rule.targetField}: no candidate column`
      noteDataset(schema.datasetId, reason)
      if (rule.onMissing === "exclude_dataset") excludedDatasets.add(schema.datasetId)
      if (rule.onMissing === "reject") { blockedDatasets.add(schema.datasetId); activationReady = false }
    }
  }

  const ruleStats = new Map<string, DataMappingPreviewSummary["rules"][number]>()
  for (const rule of profile.mappings) for (const candidate of rule.candidates) {
    ruleStats.set(`${rule.targetField}:${candidate.sourceField}`, { sourceField: candidate.sourceField, targetField: rule.targetField, sourceMatches: 0, applied: 0, preserved: 0, conflicts: 0, typeFailures: 0 })
  }
  const samples: DataMappingPreview["samples"] = []
  const preliminary: Array<{ row: ValueRow; datasetId: string; excludeRow: boolean }> = []
  for (const original of source.rows) {
    const datasetId = typeof original.__dataset_id === "string" ? original.__dataset_id : "records"
    if (excludedDatasets.has(datasetId)) continue
    const row = { ...original }
    const issues: Array<{ sourceField: string; targetField: string; reason: string }> = []
    let excludeRow = false
    for (const rule of profile.mappings) {
      const stat = targets.get(rule.targetField)!
      const existing = original[rule.targetField]
      const resolved: Array<{ sourceField: string; before: unknown; value: unknown }> = []
      for (const candidate of rule.candidates) {
        const before = original[candidate.sourceField]
        if (!present(before)) continue
        const candidateStat = ruleStats.get(`${rule.targetField}:${candidate.sourceField}`)!
        candidateStat.sourceMatches += 1
        const converted = coerce(before, candidate.coercion)
        const typed = converted.ok ? targetValue(converted.value, rule) : { ok: false as const }
        if (!typed.ok) {
          candidateStat.typeFailures += 1
          stat.typeFailures += 1
          issues.push({ sourceField: candidate.sourceField, targetField: rule.targetField, reason: "type_failure" })
          if (samples.filter((sample) => sample.sourceField === candidate.sourceField && sample.targetField === rule.targetField).length < 3) samples.push({ sourceField: candidate.sourceField, targetField: rule.targetField, before, after: null, outcome: "type_failure" })
          continue
        }
        resolved.push({ sourceField: candidate.sourceField, before, value: typed.value })
      }
      if (canonicalTargets.has(rule.targetField) && present(existing)) {
        stat.valuesResolved += 1
        for (const candidate of resolved) {
          const candidateStat = ruleStats.get(`${rule.targetField}:${candidate.sourceField}`)!
          if (sameValue(existing, candidate.value)) candidateStat.preserved += 1
          else { candidateStat.conflicts += 1; stat.conflicts += 1; issues.push({ sourceField: candidate.sourceField, targetField: rule.targetField, reason: "authoritative_value_preserved" }) }
        }
        continue
      }
      if (resolved.length) {
        const selected = resolved[0]
        const disagreement = resolved.slice(1).some((candidate) => !sameValue(candidate.value, selected.value))
        if (disagreement) {
          stat.conflicts += 1
          issues.push({ sourceField: selected.sourceField, targetField: rule.targetField, reason: "candidate_conflict" })
          for (const candidate of resolved) ruleStats.get(`${rule.targetField}:${candidate.sourceField}`)!.conflicts += 1
          if (rule.onConflict === "reject") activationReady = false
        }
        row[rule.targetField] = selected.value
        stat.valuesResolved += 1
        ruleStats.get(`${rule.targetField}:${selected.sourceField}`)!.applied += 1
        if (samples.filter((sample) => sample.sourceField === selected.sourceField && sample.targetField === rule.targetField).length < 3) samples.push({ sourceField: selected.sourceField, targetField: rule.targetField, before: selected.before, after: selected.value, outcome: disagreement ? "conflict" : "applied" })
        continue
      }
      stat.valuesMissing += 1
      issues.push({ sourceField: rule.candidates.map((candidate) => candidate.sourceField).join("|"), targetField: rule.targetField, reason: "missing" })
      if (rule.onMissing === "null") row[rule.targetField] = null
      if (rule.onMissing === "exclude_row") excludeRow = true
      if (rule.onMissing === "exclude_dataset") { excludedDatasets.add(datasetId); noteDataset(datasetId, `${rule.targetField}: required value missing`) }
      if (rule.onMissing === "reject") { blockedDatasets.add(datasetId); activationReady = false; row[rule.targetField] = null }
    }
    if (issues.length) row.__mapping_issues = issues
    row.__mapping_profile = profile.slug
    row.__mapping_profile_version = profile.version
    preliminary.push({ row, datasetId, excludeRow })
  }
  const rows = preliminary.filter((item) => !item.excludeRow && !excludedDatasets.has(item.datasetId)).map((item) => item.row)
  const rules = [...ruleStats.values()]
  const totals = (key: "sourceMatches" | "applied" | "preserved" | "conflicts" | "typeFailures") => rules.reduce((sum, rule) => sum + rule[key], 0)
  const datasetOutcomes: DataMappingDatasetOutcome[] = schemas.map((schema) => ({
    datasetId: schema.datasetId,
    datasetName: schema.datasetName,
    status: excludedDatasets.has(schema.datasetId) ? "excluded" : blockedDatasets.has(schema.datasetId) ? "blocked" : "included",
    reasons: [...(datasetReasons.get(schema.datasetId) ?? [])],
  }))
  if (!rows.length) activationReady = false
  const preview: DataMappingPreview = {
    profileVersion: profile.version,
    rowCount: rows.length,
    sourceMatches: totals("sourceMatches"), applied: totals("applied"), preserved: totals("preserved"),
    conflicts: [...targets.values()].reduce((sum, target) => sum + target.conflicts, 0),
    typeFailures: [...targets.values()].reduce((sum, target) => sum + target.typeFailures, 0), rules, samples,
    mode: "reconciliation", sourceDatasets: schemas.length,
    includedDatasets: schemas.length - excludedDatasets.size, excludedDatasets: excludedDatasets.size,
    sourceRows: source.rows.length, outputRows: rows.length, excludedRows: source.rows.length - rows.length,
    activationReady, targets: [...targets.values()], datasetOutcomes,
  }
  const missing = [...targets.values()].reduce((sum, target) => sum + target.valuesMissing, 0)
  const note = `Reconciliation profile ${profile.slug} v${profile.version}: ${preview.includedDatasets}/${preview.sourceDatasets} dataset(s), ${rows.length}/${source.rows.length} row(s), ${missing} missing target value(s), ${preview.conflicts} conflict(s), ${preview.typeFailures} type failure(s); rows are not de-duplicated.`
  const fieldTypes = new Map(source.fieldTypes ?? [])
  for (const rule of profile.mappings) fieldTypes.set(rule.targetField, dataMappingTargetType(rule))
  const mappedTargets = new Set(profile.mappings.map((rule) => rule.targetField))
  const timeTarget = profile.mappings.find((rule) => rule.role === "time")?.targetField
  const currencyTarget = profile.mappings.find((rule) => rule.role === "currency")?.targetField
  return {
    source: {
      ...source, rows, fieldTypes,
      availableFields: new Set([...source.availableFields, ...mappedTargets]),
      dateField: timeTarget ?? source.dateField ?? (mappedTargets.has("occurred_on") ? "occurred_on" : mappedTargets.has("period_start") ? "period_start" : null),
      currencyField: currencyTarget ?? source.currencyField ?? (mappedTargets.has("currency") ? "currency" : null),
      sourceLabel: `reconciled ${source.sourceLabel}`,
      coverageNote: source.coverageNote ? `${note} ${source.coverageNote}` : note,
    },
    preview,
  }
}

export function applyDataMappingProfile(profile: Pick<DataMappingProfile, "slug" | "version" | "mappings">, source: MappingSource): { source: MappingSource; preview: DataMappingPreview } {
  if (profile.mappings.every(isReconciliationMappingRule)) return applyReconciliationProfile({ ...profile, mappings: profile.mappings }, source)
  return applyLegacyDataMappingProfile({ ...profile, mappings: profile.mappings as LegacyDataMappingRule[] }, source)
}
