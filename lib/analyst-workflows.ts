export type AnalystRow = Record<string, unknown>

export type QualityRule =
  | { kind: "required"; field: string }
  | { kind: "allowed_values"; field: string; values: string[] }
  | { kind: "numeric_range"; field: string; min?: number; max?: number }
  | { kind: "unique"; field: string }

export type QualityFinding = {
  classification: "missing_required" | "invalid_value" | "out_of_range" | "duplicate"
  rowIndex: number
  field: string
  value: unknown
  message: string
  severity: "low" | "medium" | "high"
}

export type QualityResult = {
  rowCount: number
  cleanRows: number
  findings: QualityFinding[]
  score: number
  summary: { missingRequired: number; invalidValues: number; outOfRange: number; duplicates: number }
}

export function profileDataQuality(rows: AnalystRow[], rules: QualityRule[]): QualityResult {
  const findings: QualityFinding[] = []
  const seen = new Map<string, Map<string, number[]>>()
  for (const rule of rules) if (rule.kind === "unique") seen.set(rule.field, new Map())
  rows.forEach((row, index) => {
    for (const rule of rules) {
      const value = row[rule.field]
      if (rule.kind === "required" && (value === null || value === undefined || String(value).trim() === "")) findings.push({ classification: "missing_required", rowIndex: index, field: rule.field, value, message: `${rule.field} is required`, severity: "high" })
      if (rule.kind === "allowed_values" && value !== null && value !== undefined && !rule.values.includes(String(value))) findings.push({ classification: "invalid_value", rowIndex: index, field: rule.field, value, message: `${rule.field} must be one of ${rule.values.join(", ")}`, severity: "medium" })
      if (rule.kind === "numeric_range" && value !== null && value !== undefined && value !== "") {
        const parsed = Number(value)
        if (!Number.isFinite(parsed) || (rule.min !== undefined && parsed < rule.min) || (rule.max !== undefined && parsed > rule.max)) findings.push({ classification: "out_of_range", rowIndex: index, field: rule.field, value, message: `${rule.field} is outside the allowed range`, severity: "medium" })
      }
      if (rule.kind === "unique") {
        const normalized = String(value ?? "").trim()
        if (normalized) seen.get(rule.field)!.set(normalized, [...(seen.get(rule.field)!.get(normalized) ?? []), index])
      }
    }
  })
  for (const [field, values] of seen) for (const [value, indexes] of values) if (indexes.length > 1) for (const rowIndex of indexes) findings.push({ classification: "duplicate", rowIndex, field, value, message: `${field} appears ${indexes.length} times`, severity: "high" })
  const summary = { missingRequired: findings.filter((item) => item.classification === "missing_required").length, invalidValues: findings.filter((item) => item.classification === "invalid_value").length, outOfRange: findings.filter((item) => item.classification === "out_of_range").length, duplicates: findings.filter((item) => item.classification === "duplicate").length }
  const affectedRows = new Set(findings.map((item) => item.rowIndex)).size
  return { rowCount: rows.length, cleanRows: Math.max(0, rows.length - affectedRows), findings, score: rows.length ? Number(((rows.length - affectedRows) / rows.length).toFixed(4)) : 1, summary }
}

export type EodControlInput = { expectedRows: number; actualRows: number; expectedTotal?: number | null; actualTotal?: number | null; receivedFeeds: string[]; expectedFeeds: string[] }
export type EodControlResult = { status: "clear" | "breaks"; rowVariance: number; totalVariance: number | null; missingFeeds: string[]; findings: string[] }

export function evaluateEodControls(input: EodControlInput): EodControlResult {
  const rowVariance = input.actualRows - input.expectedRows
  const totalVariance = input.expectedTotal != null && input.actualTotal != null ? Number((input.actualTotal - input.expectedTotal).toFixed(2)) : null
  const received = new Set(input.receivedFeeds)
  const missingFeeds = input.expectedFeeds.filter((feed) => !received.has(feed))
  const findings: string[] = []
  if (rowVariance !== 0) findings.push(`Row count variance: ${rowVariance > 0 ? "+" : ""}${rowVariance}`)
  if (totalVariance !== null && totalVariance !== 0) findings.push(`Total variance: ${totalVariance > 0 ? "+" : ""}${totalVariance}`)
  if (missingFeeds.length) findings.push(`Missing feeds: ${missingFeeds.join(", ")}`)
  return { status: findings.length ? "breaks" : "clear", rowVariance, totalVariance, missingFeeds, findings }
}
