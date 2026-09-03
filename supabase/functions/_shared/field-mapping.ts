/**
 * The extracted document schema is deliberately kept separate from the
 * records schema. This table is the contract between the two layers.
 */

export type RecordColumn =
  | "occurred_on"
  | "is_recurring"
  | "currency"
  | "amount"
  | "counterparty"
  | "category"
  | "counterparty_normalized"
  | "period_start"
  | "period_end"
  | "direction"

export type FieldMapping = {
  extracted: string
  destination: "record_column" | "child_records" | "attribute"
  column?: RecordColumn
}

export const FIELD_MAPPINGS: readonly FieldMapping[] = [
  { extracted: "document_date", destination: "record_column", column: "occurred_on" },
  { extracted: "line_items", destination: "child_records" },
  { extracted: "is_recurring", destination: "record_column", column: "is_recurring" },
  { extracted: "currency", destination: "record_column", column: "currency" },
  { extracted: "total_amount", destination: "record_column", column: "amount" },
  { extracted: "vendor_name", destination: "record_column", column: "counterparty" },
  { extracted: "expense_category", destination: "record_column", column: "category" },
  { extracted: "vendor_normalized", destination: "record_column", column: "counterparty_normalized" },
  { extracted: "period_start", destination: "record_column", column: "period_start" },
  { extracted: "period_end", destination: "record_column", column: "period_end" },
  { extracted: "direction", destination: "record_column", column: "direction" },
  { extracted: "gross_income", destination: "record_column", column: "amount" },
  { extracted: "net_income", destination: "attribute" },
  { extracted: "employer_name", destination: "record_column", column: "counterparty" },
  { extracted: "income_source", destination: "attribute" },
  { extracted: "tax_amount", destination: "attribute" },
  { extracted: "discount_amount", destination: "attribute" },
  { extracted: "jurisdiction", destination: "attribute" },
  { extracted: "classification_rationale", destination: "attribute" },
  { extracted: "merchant_domain", destination: "attribute" },
  { extracted: "merchant_address_country", destination: "attribute" },
]

export const RECORD_COLUMN_BY_EXTRACTED = Object.fromEntries(
  FIELD_MAPPINGS
    .filter((mapping): mapping is FieldMapping & { column: RecordColumn } => mapping.destination === "record_column" && Boolean(mapping.column))
    .map((mapping) => [mapping.extracted, mapping.column]),
) as Partial<Record<string, RecordColumn>>

export const ATTRIBUTE_FIELDS = new Set(
  FIELD_MAPPINGS.filter((mapping) => mapping.destination === "attribute").map((mapping) => mapping.extracted),
)

export const CHILD_FIELD = "line_items"

export function mappingFor(extracted: string): FieldMapping | undefined {
  return FIELD_MAPPINGS.find((mapping) => mapping.extracted === extracted)
}

export function deriveDirection(
  fields: Record<string, unknown>,
  recordType: string,
): "inflow" | "outflow" | "neutral" | null {
  // Document types with an established direction keep their existing rules.
  if (recordType === "receipt" || recordType === "invoice") return "outflow"
  if (recordType === "payslip" || recordType === "income_statement") return "inflow"

  const explicit = fields.direction ?? fields.debit_credit ?? fields.credit_debit
  if (typeof explicit === "string") {
    const normalized = explicit.trim().toLowerCase()
    if (["inflow", "in", "income", "credit", "cr"].includes(normalized)) return "inflow"
    if (["outflow", "out", "expense", "debit", "dr"].includes(normalized)) return "outflow"
    if (["neutral", "none"].includes(normalized)) return "neutral"
  }

  const amount = fields.total_amount ?? fields.net_income ?? fields.gross_income
  if ((recordType === "bank_statement" || recordType === "transaction_record" || recordType === "csv_export") && typeof amount === "number") {
    if (amount < 0) return "outflow"
    if (amount > 0 && recordType !== "csv_export") return "inflow"
    // A positive CSV amount is ambiguous when the source does not identify its side.
  }
  if (typeof fields.income_source === "string" && fields.income_source.trim() !== "") return "inflow"
  if (fields.expense_category != null) return "outflow"
  return null
}
