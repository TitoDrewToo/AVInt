export const RECORD_FIELD_NAMES = [
  "occurred_on", "amount", "currency", "direction", "counterparty", "counterparty_normalized",
  "category", "period_start", "period_end", "is_recurring", "record_type", "confidence", "field_confidence", "needs_review",
] as const

export const RECORD_FIELD_SET = new Set<string>(RECORD_FIELD_NAMES)
const DATE_FIELDS = new Set(["occurred_on", "period_start", "period_end"])
const BOOLEAN_FIELDS = new Set(["is_recurring", "needs_review"])
const NUMBER_FIELDS = new Set(["amount", "confidence"])
export type CorrectionAttributeType = "text" | "number" | "date"

export function normalizeCorrectionKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

export function isValidAttributeKey(value: string) {
  const key = normalizeCorrectionKey(value)
  return key.length > 0 && key.length <= 200 && /^[a-z0-9_]+$/.test(key)
}

export function coerceCorrectionValue(target: string, value: unknown): unknown {
  if (value === null) return null
  if (DATE_FIELDS.has(target)) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${target} must be YYYY-MM-DD`)
    const date = new Date(`${value}T00:00:00Z`)
    if (date.toISOString().slice(0, 10) !== value) throw new Error(`${target} must be a real date`)
    return value
  }
  if (NUMBER_FIELDS.has(target)) {
    if (typeof value === "string") value = value.replace(/,/g, "").trim()
    const number = typeof value === "number" ? value : typeof value === "string" && value !== "" ? Number(value) : NaN
    if (!Number.isFinite(number)) throw new Error(`${target} must be a number`)
    return number
  }
  if (BOOLEAN_FIELDS.has(target)) {
    if (typeof value === "boolean") return value
    if (value === "true") return true
    if (value === "false") return false
    throw new Error(`${target} must be a boolean`)
  }
  if (target === "field_confidence") {
    if (typeof value !== "object" || Array.isArray(value)) throw new Error(`${target} must be an object`)
    return value
  }
  if (typeof value !== "string") throw new Error(`${target} must be text`)
  return value
}

export function coerceAttributeValue(valueType: CorrectionAttributeType, value: unknown): unknown {
  if (valueType === "text") {
    if (value === null || typeof value === "string") return value
    throw new Error("text attributes must be text")
  }
  if (valueType === "number") return coerceCorrectionValue("amount", value)
  return coerceCorrectionValue("occurred_on", value)
}
