/** Resolve ambiguous header mappings before copying cells. Never fall back from
 * a blank order total to a unit price merely because both resemble money. */
export function resolveSpreadsheetMapping(input: Record<string, string>): Record<string, string> {
  const mapping = { ...input }
  for (const header of Object.keys(mapping)) {
    if (/customer|client|counterparty/i.test(header) && mapping[header] === "vendor_name") mapping[header] = "counterparty_name"
    if (/order.*(id|number)|(^|_)id$/i.test(header) && !/invoice|receipt/i.test(header) && mapping[header] === "invoice_number") mapping[header] = "custom"
    if (/unit.*price|price.*unit/i.test(header) && mapping[header] === "total_amount") mapping[header] = "custom"
  }
  const targets = new Set(Object.values(mapping).filter(target => target !== "custom" && target !== "ignore"))
  for (const target of targets) {
    const headers = Object.keys(mapping).filter(header => mapping[header] === target)
    if (headers.length < 2) continue
    const totals = target === "total_amount" ? headers.filter(header => /total/i.test(header)) : []
    const selected = totals.length === 1 ? totals[0] : null
    for (const header of headers) if (header !== selected) mapping[header] = "custom"
  }
  return mapping
}

export function spreadsheetHeaderCurrency(mapping: Record<string, string>): string | null {
  const codes = new Set(Object.entries(mapping).filter(([, target]) => ["total_amount", "gross_income", "net_income", "tax_amount", "discount_amount"].includes(target)).flatMap(([header]) => {
    const match = header.match(/(?:_|\s|\()(USD|PHP|SGD|EUR|GBP|AUD|CAD|JPY|INR)(?:\))?$/i)
    return match ? [match[1].toUpperCase()] : []
  }))
  return codes.size === 1 ? [...codes][0] : null
}

/** A spreadsheet's canonical cells are facts, not prompts for a second model.
 * Unknown semantic confidence stays unknown; header/cell evidence is separate. */
export function spreadsheetFacts(fields: any): Record<string, any> | null {
  const raw = fields.raw_json?.gemini_raw
  if (!raw || typeof raw !== "object" || typeof raw._source_sheet !== "string") return null
  const result: Record<string, any> = {}
  for (const key of ["vendor_name", "employer_name", "document_date", "currency", "total_amount", "gross_income", "net_income", "expense_category", "tax_amount", "discount_amount", "invoice_number", "payment_method", "period_start", "period_end", "counterparty_name", "direction", "jurisdiction", "merchant_domain", "merchant_address_city", "merchant_address_region", "merchant_address_country", "income_source", "classification_rationale"]) result[key] = raw[key] ?? null
  return { ...result, vendor_normalized: null, confidence: null, confidence_score: null, field_confidence: {}, line_items: raw.line_items ?? [], is_recurring: raw.is_recurring === true, recurrence_cadence: raw.recurrence_cadence ?? null, _source_sheet: raw._source_sheet, _source_index: raw._source_index, _field_evidence: raw._field_evidence ?? {}, _custom_fields: raw._custom_fields ?? {} }
}
