import { currencyDecimals } from "./currencies"

export type ManualFormField =
  | "document_date"
  | "currency"
  | "vendor_name"
  | "total_amount"
  | "expense_category"
  | "tax_amount"
  | "invoice_number"
  | "employer_name"
  | "gross_income"
  | "net_income"
  | "period_start"
  | "period_end"
  | "counterparty_name"
  | "description"

export type ManualFieldDefinition = {
  formField: ManualFormField
  extractionField: string
  label: string
  input: "text" | "date" | "number" | "currency" | "category"
}

export type ManualValidationIssue = {
  field: string
  message: string
  severity: "error" | "warning"
}

export type ManualValidationInput = {
  document_type: string
  document_date: string
  currency: string
  total_amount: string
  gross_income: string
  net_income: string
  tax_amount: string
  discount_amount: string
  period_start: string
  period_end: string
  vendor_name: string
  employer_name: string
  counterparty_name: string
  invoice_number: string
  description: string
  notes: string
}

export type CustomFieldType = "text" | "number" | "date"
export type CustomFieldInput = { id: string; label: string; type: CustomFieldType; value: string }
export type CustomFieldIssue = { id: string; field: "label" | "value"; message: string }

const MAPPED_EXTRACTION_FIELDS = new Set([
  "document_date", "line_items", "is_recurring", "currency", "total_amount", "vendor_name",
  "expense_category", "vendor_normalized", "period_start", "period_end", "gross_income", "net_income",
  "employer_name", "income_source", "tax_amount", "discount_amount", "jurisdiction",
  "classification_rationale", "merchant_domain", "merchant_address_country", "amount", "counterparty", "category",
])

// Provider/provenance payloads are not user-authored fields.
const NON_USER_ATTRIBUTE_KEYS = new Set(["raw_json", "_raw_json", "gemini_raw", "openai_enriched"])

export function normalizeCustomFieldKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
}

function customFieldCollisionKeys(): Set<string> {
  const typedKeys = Object.values(DOCUMENT_TYPE_FIELDS ?? {}).flatMap((fields) => fields.map((field) => field.extractionField))
  return new Set([...MAPPED_EXTRACTION_FIELDS, ...typedKeys, ...NON_USER_ATTRIBUTE_KEYS].map(normalizeCustomFieldKey))
}

export function isCustomFieldKey(key: string): boolean {
  return !customFieldCollisionKeys().has(normalizeCustomFieldKey(key))
}

export function humanizeCustomFieldKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function validateCustomFields(fields: readonly CustomFieldInput[], currency = "USD"): CustomFieldIssue[] {
  const issues: CustomFieldIssue[] = []
  const collisions = customFieldCollisionKeys()
  const seen = new Set<string>()
  for (const field of fields) {
    const key = normalizeCustomFieldKey(field.label)
    if (typeof field.value !== "string") {
      issues.push({ id: field.id, field: "value", message: "This field has an unsupported value. Enter text, a number, or a date." })
      continue
    }
    if (!field.label.trim()) issues.push({ id: field.id, field: "label", message: "Enter a label or remove this field." })
    else if (!key) issues.push({ id: field.id, field: "label", message: "Label must contain letters or numbers." })
    else if (collisions.has(key)) issues.push({ id: field.id, field: "label", message: "That field already exists in the record." })
    else if (seen.has(key)) issues.push({ id: field.id, field: "label", message: "This label duplicates another custom field." })
    else seen.add(key)

    if (!field.value.trim()) issues.push({ id: field.id, field: "value", message: "Enter a value or remove this field." })
    else if (field.type === "number") {
      const result = parseManualNumber(field.value, currency)
      if (result.error) issues.push({ id: field.id, field: "value", message: result.error })
    } else if (field.type === "date" && !isRealDate(field.value)) {
      issues.push({ id: field.id, field: "value", message: "Enter a real calendar date." })
    } else if (field.type === "text" && field.value.length > 2000) {
      issues.push({ id: field.id, field: "value", message: "Keep this to 2000 characters or fewer." })
    }
    if (field.label.length > 200) issues.push({ id: field.id, field: "label", message: "Keep the label to 200 characters or fewer." })
  }
  return issues
}

export function customFieldsPayload(fields: readonly CustomFieldInput[], currency = "USD"): { payload: Record<string, unknown>; issues: CustomFieldIssue[] } {
  const issues = validateCustomFields(fields, currency)
  if (issues.length > 0) return { payload: {}, issues }
  const payload: Record<string, unknown> = {}
  for (const field of fields) {
    const key = normalizeCustomFieldKey(field.label)
    payload[key] = field.type === "number" ? parseManualNumber(field.value, currency).value : field.value
  }
  return { payload, issues: [] }
}

const FINANCIAL_TYPES = new Set(["receipt", "invoice", "payslip", "bank_statement", "income_statement", "tax_document"])
const NUMERIC_FIELDS = ["total_amount", "gross_income", "net_income", "tax_amount", "discount_amount"] as const

export function parseManualNumber(raw: string, currency = "USD"): { value: number | null; error?: string } {
  const input = raw.trim()
  if (!input) return { value: null }
  const negative = input.startsWith("(") && input.endsWith(")")
  const normalized = (negative ? input.slice(1, -1) : input).replace(/,/g, "").trim()
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return { value: null, error: "Enter a valid number." }
  const value = Number(normalized) * (negative ? -1 : 1)
  if (!Number.isFinite(value)) return { value: null, error: "Enter a valid number." }
  const decimals = currencyDecimals(currency)
  const decimalPart = normalized.split(".")[1] ?? ""
  if (decimalPart.length > decimals) return { value: null, error: `${currency} amounts allow at most ${decimals} decimal places.` }
  return { value }
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return date.getUTCFullYear() === Number(value.slice(0, 4))
    && date.getUTCMonth() + 1 === Number(value.slice(5, 7))
    && date.getUTCDate() === Number(value.slice(8, 10))
}

function addTextIssue(issues: ManualValidationIssue[], field: string, value: string, limit: number) {
  if (value.length > limit) issues.push({ field, message: `Keep this to ${limit} characters or fewer.`, severity: "error" })
}

export function validateManualEntry(input: ManualValidationInput, today = new Date()): ManualValidationIssue[] {
  const issues: ManualValidationIssue[] = []
  if (!input.document_date.trim()) issues.push({ field: "document_date", message: "Date is required.", severity: "error" })
  else if (!isRealDate(input.document_date)) issues.push({ field: "document_date", message: "Enter a real calendar date.", severity: "error" })
  else if (input.document_date > today.toISOString().slice(0, 10)) issues.push({ field: "document_date", message: "This date is in the future.", severity: "warning" })

  const parsed = new Map<string, number | null>()
  for (const field of NUMERIC_FIELDS) {
    const result = parseManualNumber(input[field], input.currency)
    if (result.error) issues.push({ field, message: result.error, severity: "error" })
    parsed.set(field, result.value)
  }
  const amountField = input.document_type === "payslip" ? "gross_income" : "total_amount"
  const amountPresent = (parsed.get(amountField) ?? null) !== null
  if (FINANCIAL_TYPES.has(input.document_type) && !amountPresent) issues.push({ field: amountField, message: "Amount is required for this document type.", severity: "error" })
  const anyAmountPresent = NUMERIC_FIELDS.some((field) => (parsed.get(field) ?? null) !== null)
  if (anyAmountPresent && !input.currency.trim()) issues.push({ field: "currency", message: "Currency is required when an amount is entered.", severity: "error" })

  for (const field of ["period_start", "period_end"] as const) {
    if (input[field] && !isRealDate(input[field])) issues.push({ field, message: "Enter a real calendar date.", severity: "error" })
  }
  if (isRealDate(input.period_start) && isRealDate(input.period_end) && input.period_end < input.period_start) {
    issues.push({ field: "period_end", message: "Period end is before period start.", severity: "warning" })
  }
  for (const field of ["vendor_name", "employer_name", "counterparty_name", "invoice_number"] as const) addTextIssue(issues, field, input[field], 200)
  addTextIssue(issues, "description", input.description, 2000)
  addTextIssue(issues, "notes", input.notes, 2000)
  return issues
}

export const DOCUMENT_TYPE_OPTIONS = [
  { value: "receipt", label: "Receipt" },
  { value: "invoice", label: "Invoice" },
  { value: "payslip", label: "Payslip" },
  { value: "income_statement", label: "Income Statement" },
  { value: "bank_statement", label: "Bank Statement" },
  { value: "contract", label: "Contract" },
  { value: "agreement", label: "Agreement" },
  { value: "tax_document", label: "Tax Document" },
  { value: "general_document", label: "Other" },
] as const

const date: ManualFieldDefinition = { formField: "document_date", extractionField: "document_date", label: "Date", input: "date" }
const currency: ManualFieldDefinition = { formField: "currency", extractionField: "currency", label: "Currency", input: "currency" }
const amount: ManualFieldDefinition = { formField: "total_amount", extractionField: "total_amount", label: "Amount", input: "number" }
const vendorCounterparty: ManualFieldDefinition = { formField: "vendor_name", extractionField: "vendor_name", label: "Counterparty", input: "text" }
const contractCounterparty: ManualFieldDefinition = { formField: "counterparty_name", extractionField: "vendor_name", label: "Counterparty", input: "text" }

export const DOCUMENT_TYPE_FIELDS: Record<string, readonly ManualFieldDefinition[]> = {
  receipt: [vendorCounterparty, date, amount, currency,
    { formField: "expense_category", extractionField: "expense_category", label: "Category", input: "category" },
    { formField: "tax_amount", extractionField: "tax_amount", label: "Tax Amount", input: "number" }],
  invoice: [vendorCounterparty,
    { formField: "invoice_number", extractionField: "invoice_number", label: "Invoice Number", input: "text" }, date, amount, currency],
  payslip: [
    { formField: "employer_name", extractionField: "employer_name", label: "Employer", input: "text" },
    { formField: "period_start", extractionField: "period_start", label: "Period Start", input: "date" },
    { formField: "period_end", extractionField: "period_end", label: "Period End", input: "date" },
    { formField: "gross_income", extractionField: "gross_income", label: "Gross Income", input: "number" },
    { formField: "net_income", extractionField: "net_income", label: "Net Income", input: "number" },
    date,
    currency,
  ],
  contract: [contractCounterparty, date,
    { formField: "period_start", extractionField: "period_start", label: "Period Start", input: "date" },
    { formField: "period_end", extractionField: "period_end", label: "Period End", input: "date" }, amount, currency],
  agreement: [contractCounterparty, date,
    { formField: "period_start", extractionField: "period_start", label: "Period Start", input: "date" },
    { formField: "period_end", extractionField: "period_end", label: "Period End", input: "date" }, amount, currency],
  other: [vendorCounterparty, date, amount, currency,
    { formField: "description", extractionField: "description", label: "Description", input: "text" }],
  income_statement: [vendorCounterparty, date, amount, currency],
  bank_statement: [vendorCounterparty, date, amount, currency],
  tax_document: [vendorCounterparty, date, amount, currency],
  general_document: [vendorCounterparty, date, amount, currency,
    { formField: "description", extractionField: "description", label: "Description", input: "text" }],
}

export function fieldsForDocumentType(documentType: string): readonly ManualFieldDefinition[] {
  return DOCUMENT_TYPE_FIELDS[documentType] ?? DOCUMENT_TYPE_FIELDS.other
}
