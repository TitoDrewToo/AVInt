"use client"

import { useEffect, useState } from "react"
import { X, PenLine, Tag } from "lucide-react"
import { supabase } from "@/lib/supabase"

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

const DOCUMENT_TYPES = [
  { value: "receipt",          label: "Receipt" },
  { value: "invoice",          label: "Invoice" },
  { value: "payslip",          label: "Payslip" },
  { value: "income_statement", label: "Income Statement" },
  { value: "bank_statement",   label: "Bank Statement" },
  { value: "contract",         label: "Contract" },
  { value: "agreement",        label: "Agreement" },
  { value: "tax_document",     label: "Tax Document" },
  { value: "general_document", label: "General Document" },
]

const EXPENSE_CATEGORIES = [
  "Food", "Transport", "Utilities", "Healthcare", "Entertainment",
  "Shopping", "Travel", "Office", "Salary", "Tax", "Legal", "Other",
]

const PAYMENT_METHODS = [
  "Cash", "Credit Card", "Debit Card", "Bank Transfer", "GCash", "PayMaya", "Check", "Other",
]

const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "SGD", "JPY", "AUD"]

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
  notes: string
}

const EMPTY_FORM: FormState = {
  document_type: "receipt",
  document_name: "",
  document_date: "",
  currency: "PHP",
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
  notes: "",
}

// ---------------------------------------------------------------------------
// Adaptive field helpers
// ---------------------------------------------------------------------------

function isExpenseType(t: string) {
  return ["receipt", "invoice", "general_document", "tax_document", "bank_statement"].includes(t)
}
function isIncomeType(t: string) {
  return ["payslip", "income_statement"].includes(t)
}
function isContractType(t: string) {
  return ["contract", "agreement"].includes(t)
}

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
}

function DocumentFormBody({ form, onChange, isManual }: DocumentFormBodyProps) {
  const expense  = isExpenseType(form.document_type)
  const income   = isIncomeType(form.document_type)
  const contract = isContractType(form.document_type)

  return (
    <div className="space-y-4">
      {/* Document Type */}
      <div>
        <p className={sectionLabelCls}>Document Type</p>
        <select
          className={inputCls}
          value={form.document_type}
          onChange={(e) => onChange("document_type", e.target.value)}
          required
        >
          {DOCUMENT_TYPES.map((dt) => (
            <option key={dt.value} value={dt.value}>
              {dt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Document Name — manual entry only */}
      {isManual && (
        <div>
          <p className={sectionLabelCls}>Document Name</p>
          <input
            className={inputCls}
            type="text"
            placeholder='e.g. Coffee at Jollibee'
            value={form.document_name}
            onChange={(e) => onChange("document_name", e.target.value)}
          />
        </div>
      )}

      {/* Date + Currency */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className={sectionLabelCls}>Date *</p>
          <input
            className={inputCls}
            type="date"
            required
            value={form.document_date}
            onChange={(e) => onChange("document_date", e.target.value)}
          />
        </div>
        <div>
          <p className={sectionLabelCls}>Currency</p>
          <select
            className={inputCls}
            value={form.currency}
            onChange={(e) => onChange("currency", e.target.value)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Expense fields                                                       */}
      {/* ------------------------------------------------------------------ */}
      {expense && (
        <div className="space-y-3 mt-4">
          <p className={sectionLabelCls}>Expense Details</p>

          {/* Vendor */}
          <div>
            <input
              className={inputCls}
              type="text"
              placeholder="Vendor Name *"
              value={form.vendor_name}
              onChange={(e) => onChange("vendor_name", e.target.value)}
            />
          </div>

          {/* Total Amount + Category */}
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Total Amount *"
              value={form.total_amount}
              onChange={(e) => onChange("total_amount", e.target.value)}
            />
            <select
              className={inputCls}
              value={form.expense_category}
              onChange={(e) => onChange("expense_category", e.target.value)}
            >
              <option value="">Category…</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Payment Method + Tax */}
          <div className="grid grid-cols-2 gap-3">
            <select
              className={inputCls}
              value={form.payment_method}
              onChange={(e) => onChange("payment_method", e.target.value)}
            >
              <option value="">Payment Method…</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Tax Amount"
              value={form.tax_amount}
              onChange={(e) => onChange("tax_amount", e.target.value)}
            />
          </div>

          {/* Discount */}
          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Discount Amount"
              value={form.discount_amount}
              onChange={(e) => onChange("discount_amount", e.target.value)}
            />
            <div /> {/* spacer */}
          </div>

          {/* Invoice / Ref */}
          <div>
            <input
              className={inputCls}
              type="text"
              placeholder="Invoice / Ref #"
              value={form.invoice_number}
              onChange={(e) => onChange("invoice_number", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Income fields                                                        */}
      {/* ------------------------------------------------------------------ */}
      {income && (
        <div className="space-y-3 mt-4">
          <p className={sectionLabelCls}>Income Details</p>

          <div>
            <input
              className={inputCls}
              type="text"
              placeholder="Employer Name *"
              value={form.employer_name}
              onChange={(e) => onChange("employer_name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Gross Income *"
              value={form.gross_income}
              onChange={(e) => onChange("gross_income", e.target.value)}
            />
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Net Income"
              value={form.net_income}
              onChange={(e) => onChange("net_income", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={sectionLabelCls}>Period Start</p>
              <input
                className={inputCls}
                type="date"
                value={form.period_start}
                onChange={(e) => onChange("period_start", e.target.value)}
              />
            </div>
            <div>
              <p className={sectionLabelCls}>Period End</p>
              <input
                className={inputCls}
                type="date"
                value={form.period_end}
                onChange={(e) => onChange("period_end", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Contract fields                                                      */}
      {/* ------------------------------------------------------------------ */}
      {contract && (
        <div className="space-y-3 mt-4">
          <p className={sectionLabelCls}>Contract Details</p>

          <div>
            <input
              className={inputCls}
              type="text"
              placeholder="Counterparty Name *"
              value={form.counterparty_name}
              onChange={(e) => onChange("counterparty_name", e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.01"
              placeholder="Total Value"
              value={form.total_amount}
              onChange={(e) => onChange("total_amount", e.target.value)}
            />
            <div /> {/* currency already shown above */}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={sectionLabelCls}>Period Start</p>
              <input
                className={inputCls}
                type="date"
                value={form.period_start}
                onChange={(e) => onChange("period_start", e.target.value)}
              />
            </div>
            <div>
              <p className={sectionLabelCls}>Period End</p>
              <input
                className={inputCls}
                type="date"
                value={form.period_end}
                onChange={(e) => onChange("period_end", e.target.value)}
              />
            </div>
          </div>

          <div>
            <input
              className={inputCls}
              type="text"
              placeholder="Invoice / Ref #"
              value={form.invoice_number}
              onChange={(e) => onChange("invoice_number", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Notes — always at bottom                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="mt-4">
        <p className={sectionLabelCls}>Notes</p>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          placeholder="Optional notes…"
          value={form.notes}
          onChange={(e) => onChange("notes", e.target.value)}
        />
      </div>
    </div>
  )
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setForm({ ...EMPTY_FORM })
      setError(null)
    }
  }, [isOpen])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // Validation
    if (!form.document_date) {
      setError("Document date is required.")
      return
    }
    if (isContractType(form.document_type) && !form.counterparty_name.trim()) {
      setError("Counterparty name is required for contracts.")
      return
    }
    if (
      isExpenseType(form.document_type) &&
      !form.total_amount.trim()
    ) {
      setError("Total amount is required for this document type.")
      return
    }
    if (
      isIncomeType(form.document_type) &&
      !form.gross_income.trim()
    ) {
      setError("Gross income is required for this document type.")
      return
    }

    setSaving(true)
    try {
      const filename = generateFilename(form)

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
          currency: form.currency || "PHP",
          total_amount: parseFloat(form.total_amount) || null,
          gross_income: parseFloat(form.gross_income) || null,
          net_income: parseFloat(form.net_income) || null,
          tax_amount: parseFloat(form.tax_amount) || null,
          discount_amount: parseFloat(form.discount_amount) || null,
          expense_category: form.expense_category || null,
          payment_method: form.payment_method || null,
          invoice_number: form.invoice_number || null,
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          counterparty_name: form.counterparty_name || null,
          normalization_status: "manual",
          confidence_score: 1.0,
          raw_json: { notes: form.notes || null },
        })

      if (fieldsErr) {
        throw new Error(fieldsErr.message ?? "Failed to save document fields.")
      }

      onCreated(fileRow as InsertedFile)
      setForm({ ...EMPTY_FORM })
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
          <DocumentFormBody form={form} onChange={handleChange} isManual={true} />

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
          .select("*")
          .eq("file_id", fileId)
          .single()

        if (fetchErr && fetchErr.code !== "PGRST116") {
          // PGRST116 = no rows — that's OK, just use empty form
          throw new Error(fetchErr.message)
        }

        if (data) {
          setForm({
            document_type: data.document_type ?? "receipt",
            document_name: "",
            document_date: data.document_date ?? "",
            currency: data.currency ?? "PHP",
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
            notes: data.raw_json?.notes ?? "",
          })
        } else {
          setForm({ ...EMPTY_FORM })
        }
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
        .select("document_type")
        .eq("id", fileId)
        .single()

      if (data?.document_type) {
        setForm((prev) => ({ ...prev, document_type: data.document_type }))
      }
    }

    fetchFileDocType()
  }, [isOpen, fileId])

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fileId) return
    setError(null)

    setSaving(true)
    try {
      // Update document_fields
      const { error: fieldsErr } = await supabase
        .from("document_fields")
        .update({
          vendor_name: form.vendor_name || null,
          employer_name: form.employer_name || null,
          document_date: form.document_date || null,
          currency: form.currency || "PHP",
          total_amount: parseFloat(form.total_amount) || null,
          gross_income: parseFloat(form.gross_income) || null,
          net_income: parseFloat(form.net_income) || null,
          tax_amount: parseFloat(form.tax_amount) || null,
          discount_amount: parseFloat(form.discount_amount) || null,
          expense_category: form.expense_category || null,
          payment_method: form.payment_method || null,
          invoice_number: form.invoice_number || null,
          period_start: form.period_start || null,
          period_end: form.period_end || null,
          counterparty_name: form.counterparty_name || null,
          raw_json: { notes: form.notes || null },
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
              <DocumentFormBody form={form} onChange={handleChange} isManual={false} />

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
