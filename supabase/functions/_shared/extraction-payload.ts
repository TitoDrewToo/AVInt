const EXTRACTION_FIELDS = [
  "document_type",
  "vendor_name",
  "vendor_normalized",
  "employer_name",
  "document_date",
  "currency",
  "total_amount",
  "gross_income",
  "net_income",
  "expense_category",
  "jurisdiction",
  "income_source",
  "classification_rationale",
  "confidence",
  "confidence_score",
  "field_confidence",
  "tax_amount",
  "discount_amount",
  "invoice_number",
  "payment_method",
  "period_start",
  "period_end",
  "direction",
  "counterparty_name",
  "merchant_domain",
  "merchant_address_city",
  "merchant_address_region",
  "merchant_address_country",
  "is_recurring",
  "recurrence_cadence",
  "line_items",
] as const

export function buildExtractionPayload(row: Record<string, unknown>, documentType?: string | null): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const field of EXTRACTION_FIELDS) {
    if (row[field] !== undefined) payload[field] = row[field]
  }
  if (documentType) payload.document_type = documentType
  return payload
}
