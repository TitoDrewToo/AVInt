"use client"

import { useEffect, useState } from "react"
import { X, PenLine, Tag } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { ALL_SC_CATEGORIES } from "@/lib/tax-bundle"
import { DOCUMENT_TYPE_OPTIONS, fieldsForDocumentType, humanizeCustomFieldKey, isCustomFieldKey, parseManualNumber, customFieldsPayload, validateCustomFields, validateManualEntry, type CustomFieldInput, type ManualFieldDefinition, type ManualValidationInput } from "@/lib/document-type-fields"
import { SUPPORTED_CURRENCIES, currencyDecimals } from "@/lib/currencies"

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const EXPENSE_CATEGORIES = [...ALL_SC_CATEGORIES, "Other"]

// ---------------------------------------------------------------------------
// FormState
// ---------------------------------------------------------------------------

interface FormState {
  document_type: string
  document_name: string
  document_date: string
  currency: string
  vendor_name: string
  total_amount: string
  expense_category: string
  payment_method: string
  tax_amount: string
  discount_amount: string
  invoice_number: string
  employer_name: string
  gross_income: string
  net_income: string
  period_start: string
  period_end: string
  counterparty_name: string
  description: string
  notes: string
}

interface DocumentFieldsFormRow {
  document_date: string | null
  currency: string | null
  vendor_name: string | null
  total_amount: number | string | null
  expense_category: string | null
  payment_method: string | null
  tax_amount: number | string | null
  discount_amount: number | string | null
  invoice_number: string | null
  employer_name: string | null
  gross_income: number | string | null
  net_income: number | string | null
  period_start: string | null
  period_end: string | null
  counterparty_name: string | null
  notes: string | null
}

const EMPTY_FORM: FormState = {
  document_type: "receipt",
  document_name: "",
  document_date: "",
  currency: "USD",
  vendor_name: "",
  total_amount: "",
  expense_category: "",
  payment_method: "",
  tax_amount: "",
  discount_amount: "",
  invoice_number: "",
  employer_name: "",
  gross_income: "",
  net_income: "",
  period_start: "",
  period_end: "",
  counterparty_name: "",
  description: "",
  notes: "",
}

const DOCUMENT_FIELDS_FORM_SELECT = `
  document_date,
  currency,
  vendor_name,
  total_amount,
  expense_category,
  payment_method,
  tax_amount,
  discount_amount,
  invoice_number,
  employer_name,
  gross_income,
  net_income,
  period_start,
  period_end,
  counterparty_name,
  notes
`

function toFormState(data: DocumentFieldsFormRow): FormState {
  return {
    document_type: "receipt",
    document_name: "",
    document_date: data.document_date ?? "",
    currency: data.currency ?? "USD",
    vendor_name: data.vendor_name ?? "",
    total_amount: String(data.total_amount ?? ""),
    expense_category: data.expense_category ?? "",
    payment_method: data.payment_method ?? "",
    tax_amount: String(data.tax_amount ?? ""),
    discount_amount: String(data.discount_amount ?? ""),
    invoice_number: data.invoice_number ?? "",
    employer_name: data.employer_name ?? "",
    gross_income: String(data.gross_income ?? ""),
    net_income: String(data.net_income ?? ""),
    period_start: data.period_start ?? "",
    period_end: data.period_end ?? "",
    counterparty_name: data.counterparty_name ?? "",
    description: "",
    notes: data.notes ?? "",
  }
}

function fieldsFor(form: FormState) {
  return fieldsForDocumentType(form.document_type)
}

const DOCUMENT_TYPES = DOCUMENT_TYPE_OPTIONS
function isExpenseType(t: string) { return ["receipt", "invoice", "general_document", "tax_document", "bank_statement"].includes(t) }
function isIncomeType(t: string) { return ["payslip", "income_statement"].includes(t) }
function isContractType(t: string) { return ["contract", "agreement"].includes(t) }

// ---------------------------------------------------------------------------
// Shared style helpers
// ---------------------------------------------------------------------------

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"

const sectionLabelCls =
  "mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"

// ---------------------------------------------------------------------------
// DocumentFormBody
// ---------------------------------------------------------------------------

interface DocumentFormBodyProps {
  form: FormState
  onChange: (field: keyof FormState, value: string) => void
  isManual: boolean
  customFields: CustomFieldInput[]
  customFieldSuggestions: string[]
  onCustomFieldChange: (id: string, field: keyof Omit<CustomFieldInput, "id">, value: string) => void
  onAddCustomField: () => void
  onRemoveCustomField: (id: string) => void
}

function DynamicDocumentFormBody({ form, onChange, isManual, customFields, customFieldSuggestions, onCustomFieldChange, onAddCustomField, onRemoveCustomField }: DocumentFormBodyProps) {
  const validationInput = form as ManualValidationInput
  const validationIssues = validateManualEntry(validationInput)
  const issuesFor = (field: string) => validationIssues.filter((issue) => issue.field === field)
  const renderField = (definition: ManualFieldDefinition) => {
    const value = form[definition.formField]
    const onFieldChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(definition.formField, event.target.value)
    if (definition.input === "currency") return <select className={inputCls} value={value} onChange={onFieldChange}>{SUPPORTED_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.label}</option>)}</select>
    if (definition.input === "category") return <select className={inputCls} value={value} onChange={onFieldChange}><option value="">Category…</option>{EXPENSE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
    const numeric = definition.input === "number"
    const fieldIssues = issuesFor(definition.formField)
    return <>
      <input className={inputCls} type={numeric ? "text" : definition.input} inputMode={numeric ? "decimal" : undefined} step={numeric ? 10 ** -currencyDecimals(form.currency) : undefined} placeholder={definition.label} value={value} onChange={onFieldChange} />
      {fieldIssues.map((issue) => <p key={`${issue.severity}-${issue.message}`} className={`mt-1 text-xs ${issue.severity === "warning" ? "text-amber-600" : "text-destructive"}`}>{issue.message}</p>)}
    </>
  }
  const customIssues = validateCustomFields(customFields, form.currency)
  const issuesForCustom = (id: string, field: "label" | "value") => customIssues.filter((issue) => issue.id === id && issue.field === field)
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      <div><p className={sectionLabelCls}>Document Type</p><select className={inputCls} value={form.document_type} onChange={(event) => onChange("document_type", event.target.value)} required>{DOCUMENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {isManual && <div><p className={sectionLabelCls}>Document Name</p><input className={inputCls} type="text" placeholder="e.g. Office supplies receipt" value={form.document_name} onChange={(event) => onChange("document_name", event.target.value)} /></div>}
    </div>
    <div className="grid grid-cols-2 gap-3">{fieldsFor(form).map((definition) => <div key={definition.formField}><p className={sectionLabelCls}>{definition.label}</p>{renderField(definition)}</div>)}</div>
    <div className="space-y-2">
      <div className="flex items-center justify-between"><p className={sectionLabelCls}>Custom Fields</p><button type="button" className="text-xs font-medium text-primary hover:underline disabled:opacity-50" onClick={onAddCustomField} disabled={customFields.length >= 10}>+ Add field</button></div>
      {customFields.map((customField) => <div key={customField.id} className="grid grid-cols-[1fr_7rem_1fr_auto] items-start gap-2">
        <div><input className={inputCls} type="text" list="custom-field-suggestions" placeholder="Label" value={customField.label} onChange={(event) => onCustomFieldChange(customField.id, "label", event.target.value)} />{issuesForCustom(customField.id, "label").map((issue) => <p key={issue.message} className="mt-1 text-xs text-destructive">{issue.message}</p>)}</div>
        <select className={inputCls} value={customField.type} onChange={(event) => onCustomFieldChange(customField.id, "type", event.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option></select>
        <div><input className={inputCls} type={customField.type === "date" ? "date" : "text"} inputMode={customField.type === "number" ? "decimal" : undefined} step={customField.type === "number" ? 10 ** -currencyDecimals(form.currency) : undefined} placeholder="Value" value={customField.value} onChange={(event) => onCustomFieldChange(customField.id, "value", event.target.value)} />{issuesForCustom(customField.id, "value").map((issue) => <p key={issue.message} className="mt-1 text-xs text-destructive">{issue.message}</p>)}</div>
        <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive" aria-label="Remove custom field" onClick={() => onRemoveCustomField(customField.id)}>×</button>
      </div>)}
      <datalist id="custom-field-suggestions">{customFieldSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>
    </div>
    <div><p className={sectionLabelCls}>Notes</p><textarea className={`${inputCls} resize-none`} rows={2} placeholder="Optional notes…" value={form.notes} onChange={(event) => onChange("notes", event.target.value)} /></div>
  </div>
}

// ---------------------------------------------------------------------------
// Filename generator
// ---------------------------------------------------------------------------

function formatDateLabel(dateStr: string): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr + "T00:00:00")
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

function generateFilename(form: FormState): string {
  if (form.document_name.trim()) return form.document_name.trim()

  const dateLabel = formatDateLabel(form.document_date)
  const suffix = dateLabel ? ` · ${dateLabel}` : ""

  if (isExpenseType(form.document_type) && form.vendor_name.trim()) {
    return `${form.vendor_name.trim()}${suffix}`
  }
  if (isIncomeType(form.document_type) && form.employer_name.trim()) {
    return `${form.employer_name.trim()}${suffix}`
  }
  if (isContractType(form.document_type) && form.counterparty_name.trim()) {
    return `${form.counterparty_name.trim()}${suffix}`
  }
  return `Manual Entry${suffix}`
}

function humanizeAttributeType(valueType: string): CustomFieldInput["type"] {
  return valueType === "number" ? "number" : valueType === "date" ? "date" : "text"
}

function customFieldId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function customFieldsFromAttributes(rows: Array<{ field_key: string; value: unknown; value_type: string }>): CustomFieldInput[] {
  return rows.filter((row) => isCustomFieldKey(row.field_key)).slice(0, 10).map((row) => ({
    id: customFieldId(),
    label: humanizeCustomFieldKey(row.field_key),
    type: humanizeAttributeType(row.value_type),
    value: row.value == null ? "" : String(row.value),
  }))
}

async function previousCustomFieldSuggestions(userId: string): Promise<string[]> {
  const { data } = await supabase.from("record_attributes").select("field_key").eq("user_id", userId).order("field_key", { ascending: true })
  return Array.from(new Set((data ?? []).map((row) => row.field_key).filter((key): key is string => typeof key === "string" && isCustomFieldKey(key))))
    .map(humanizeCustomFieldKey)
}

// ---------------------------------------------------------------------------
// ManualEntryModal
// ---------------------------------------------------------------------------

interface InsertedFile {
  id: string
  filename: string
  file_type: string
  file_size: number
  document_type: string
  created_at: string
  storage_path: string
  folder_id: string | null
}

interface ManualEntryModalProps {
  isOpen: boolean
  userId: string
  onClose: () => void
  onCreated: (file: InsertedFile) => void
}

export function ManualEntryModal({ isOpen, userId, onClose, onCreated }: ManualEntryModalProps) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [customFields, setCustomFields] = useState<CustomFieldInput[]>([])
  const [customFieldSuggestions, setCustomFieldSuggestions] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM })
      setCustomFields([])
      setError(null)
      void (async () => {
        const { data } = await supabase
          .from("records")
          .select("currency")
          .eq("user_id", userId)
          .not("currency", "is", null)
          .order("occurred_on", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle()
        const recent = typeof data?.currency === "string" && SUPPORTED_CURRENCIES.some((currency) => currency.code === data.currency)
          ? data.currency
          : "USD"
        setForm((previous) => ({ ...previous, currency: recent }))
      })()
      void previousCustomFieldSuggestions(userId).then(setCustomFieldSuggestions)
    }
  }, [isOpen, userId])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleCustomFieldChange(id: string, field: keyof Omit<CustomFieldInput, "id">, value: string) {
    setCustomFields((previous) => previous.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const validationIssues = validateManualEntry(form)
    const firstError = validationIssues.find((issue) => issue.severity === "error")
    if (firstError) {
      setError(firstError.message)
      return
    }
    const customValidationIssues = validateCustomFields(customFields, form.currency)
    if (customValidationIssues.length > 0) {
      setError(customValidationIssues[0].message)
      return
    }

    setSaving(true)
    try {
      const filename = generateFilename(form)
      const customPayload = customFieldsPayload(customFields, form.currency).payload
      const numericValue = (field: keyof Pick<FormState, "total_amount" | "gross_income" | "net_income" | "tax_amount" | "discount_amount">) => {
        const parsed = parseManualNumber(form[field], form.currency)
        return parsed.value
      }

      // Insert into files
      const { data: fileRow, error: fileErr } = await supabase
        .from("files")
        .insert({
          user_id: userId,
          filename,
          file_type: "manual",
          file_size: 0,
          document_type: form.document_type,
          storage_path: "",
          folder_id: null,
        })
        .select()
        .single()

      if (fileErr || !fileRow) {
        throw new Error(fileErr?.message ?? "Failed to create file record.")
      }

      // Insert into document_fields
      const { error: fieldsErr } = await supabase
        .from("document_fields")
        .insert({
          file_id: fileRow.id,
          vendor_name: form.vendor_name || null,
          employer_name: form.employer_name || null,
          document_date: form.document_date || null,
          currency: form.currency || null,
          total_amount: numericValue("total_amount"),
          gross_income: numericValue("gross_income"),
          net_income: numericValue("net_income"),
          tax_amount: numericValue("tax_amount"),
          discount_amount: numericValue("discount_amount"),
          expense_category: form.expense_category || null,
          payment_method: form.payment_method || null,
          invoice_number: form.invoice_number || null,
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          counterparty_name: form.counterparty_name || null,
          normalization_status: "manual",
          confidence_score: 1.0,
          notes: form.description || form.notes || null,
        })

      if (fieldsErr) {
        throw new Error(fieldsErr.message ?? "Failed to save document fields.")
      }

      // Manual records bypass the Edge Function ingestion chain, so project
      // the saved row into the same virtual data layer before refreshing the
      // workspace. The endpoint re-checks ownership server-side.
      const accessToken = (await supabase.auth.getSession()).data.session?.access_token
      if (accessToken) {
        const syncResponse = await fetch("/api/virtual-records/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ file_id: fileRow.id, custom_fields: customFields, custom_payload: customPayload }),
        })
        if (!syncResponse.ok) throw new Error("Manual entry saved, but the data model could not be refreshed.")
      }

      onCreated(fileRow as InsertedFile)
      setForm({ ...EMPTY_FORM })
      setCustomFields([])
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-w-lg w-full mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground">Add Manual Entry</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <DynamicDocumentFormBody form={form} onChange={handleChange} customFields={customFields} customFieldSuggestions={customFieldSuggestions} onCustomFieldChange={handleCustomFieldChange} onAddCustomField={() => setCustomFields((previous) => previous.length >= 10 ? previous : [...previous, { id: customFieldId(), label: "", type: "text", value: "" }])} onRemoveCustomField={(id) => setCustomFields((previous) => previous.filter((item) => item.id !== id))} isManual={true} />

          {/* Error */}
          {error && (
            <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Entry"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReclassifyModal
// ---------------------------------------------------------------------------

interface ReclassifyModalProps {
  isOpen: boolean
  fileId: string | null
  filename: string
  onClose: () => void
  onSaved: (fileId: string, newDocumentType: string) => void
}

export function ReclassifyModal({ isOpen, fileId, filename, onClose, onSaved }: ReclassifyModalProps) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM })
  const [customFields, setCustomFields] = useState<CustomFieldInput[]>([])
  const [customFieldSuggestions, setCustomFieldSuggestions] = useState<string[]>([])
  const [fileType, setFileType] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch existing document_fields when fileId changes
  useEffect(() => {
    if (!isOpen || !fileId) return

    async function fetchFields() {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchErr } = await supabase
          .from("document_fields")
          .select(DOCUMENT_FIELDS_FORM_SELECT)
          .eq("file_id", fileId)
          .single()

        if (fetchErr && fetchErr.code !== "PGRST116") {
          // PGRST116 = no rows — that's OK, just use empty form
          throw new Error(fetchErr.message)
        }

        if (data) {
          setForm(toFormState(data))
        } else {
          setForm({ ...EMPTY_FORM })
        }
        const { data: record } = await supabase.from("records").select("id").eq("file_id", fileId).is("parent_record_id", null).maybeSingle()
        if (record?.id) {
          const { data: attributes } = await supabase.from("record_attributes").select("field_key, value, value_type").eq("record_id", record.id)
          setCustomFields(customFieldsFromAttributes(attributes ?? []))
        } else {
          setCustomFields([])
        }
        setCustomFieldSuggestions([])
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load document fields.")
      } finally {
        setLoading(false)
      }
    }

    fetchFields()
  }, [isOpen, fileId])

  // Also fetch document_type from files table to pre-fill correctly
  useEffect(() => {
    if (!isOpen || !fileId) return

    async function fetchFileDocType() {
      const { data } = await supabase
        .from("files")
        .select("document_type, file_type")
        .eq("id", fileId)
        .single()

      if (data?.document_type) {
        setForm((prev) => ({ ...prev, document_type: data.document_type }))
      }
      setFileType(data?.file_type ?? null)
    }

    fetchFileDocType()
  }, [isOpen, fileId])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleCustomFieldChange(id: string, field: keyof Omit<CustomFieldInput, "id">, value: string) {
    setCustomFields((previous) => previous.map((item) => item.id === id ? { ...item, [field]: value } : item))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fileId) return
    setError(null)

    const firstError = validateManualEntry(form).find((issue) => issue.severity === "error")
    const customValidationIssues = validateCustomFields(customFields, form.currency)
    if (firstError || customValidationIssues.length > 0) {
      setError(firstError?.message ?? customValidationIssues[0].message)
      return
    }

    setSaving(true)
    try {
      const numericValue = (field: keyof Pick<FormState, "total_amount" | "gross_income" | "net_income" | "tax_amount" | "discount_amount">) => parseManualNumber(form[field], form.currency).value
      // Update document_fields
      const { error: fieldsErr } = await supabase
        .from("document_fields")
        .update({
          vendor_name: form.vendor_name || null,
          employer_name: form.employer_name || null,
          document_date: form.document_date || null,
          currency: form.currency || null,
          total_amount: numericValue("total_amount"),
          gross_income: numericValue("gross_income"),
          net_income: numericValue("net_income"),
          tax_amount: numericValue("tax_amount"),
          discount_amount: numericValue("discount_amount"),
          expense_category: form.expense_category || null,
          payment_method: form.payment_method || null,
          invoice_number: form.invoice_number || null,
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          counterparty_name: form.counterparty_name || null,
          notes: form.notes || null,
        })
        .eq("file_id", fileId)

      if (fieldsErr) {
        throw new Error(fieldsErr.message ?? "Failed to update document fields.")
      }

      // Update files.document_type
      const { error: fileErr } = await supabase
        .from("files")
        .update({ document_type: form.document_type })
        .eq("id", fileId)

      if (fileErr) {
        throw new Error(fileErr.message ?? "Failed to update document type.")
      }

      const session = (await supabase.auth.getSession()).data.session
      if (session?.access_token) {
        const endpoint = fileType === "manual" ? "/api/virtual-records/sync" : "/api/retry-normalization"
        const retryResponse = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ file_id: fileId, custom_fields: customFields, custom_payload: customFieldsPayload(customFields, form.currency).payload }),
        })
        if (!retryResponse.ok) throw new Error(fileType === "manual"
          ? "Manual entry saved, but its record could not be refreshed."
          : "Classification saved, but normalization retry could not start.")
      }

      onSaved(fileId, form.document_type)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.")
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-w-lg w-full mx-4 rounded-2xl border border-border bg-card shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Reclassify Document</h2>
              {filename && (
                <p className="text-xs text-muted-foreground truncate max-w-[280px]">{filename}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <DynamicDocumentFormBody form={form} onChange={handleChange} customFields={customFields} customFieldSuggestions={customFieldSuggestions} onCustomFieldChange={handleCustomFieldChange} onAddCustomField={() => setCustomFields((previous) => previous.length >= 10 ? previous : [...previous, { id: customFieldId(), label: "", type: "text", value: "" }])} onRemoveCustomField={(id) => setCustomFields((previous) => previous.filter((item) => item.id !== id))} isManual={false} />

              {/* Error */}
              {error && (
                <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
