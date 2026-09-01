import { supabase } from "@/lib/supabase"

export const DASHBOARD_READY_STATUSES = ["normalized", "manual"] as const
export type DashboardReadyStatus = typeof DASHBOARD_READY_STATUSES[number]

export type NormalizedDocumentField = {
  file_id: string
  document_date: string | null
  total_amount: number | null
  gross_income: number | null
  net_income: number | null
  expense_category: string | null
  merchant_domain: string | null
  currency: string | null
  normalization_status: DashboardReadyStatus
  raw_json: unknown
  vendor_normalized?: string | null
  merchant_address_region?: string | null
  is_recurring?: boolean | null
  line_items?: unknown
  files?: { document_type: string | null; filename: string | null; user_id?: string } | Array<{ document_type: string | null; filename: string | null; user_id?: string }>
}

export async function fetchDashboardReadyFields(
  userId: string,
  options: { fileIds?: string[]; dateFrom?: string; dateTo?: string } = {},
) {
  let query = supabase
    .from("records")
    .select("id, file_id, source_key, occurred_on, amount, currency, category, counterparty_normalized, is_recurring, confidence, parent_record_id, excluded_at, files!inner(document_type, filename, user_id)")
    .eq("user_id", userId)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .order("occurred_on", { ascending: true })
    .order("source_key", { ascending: true })

  if (options.fileIds?.length) query = query.in("file_id", options.fileIds)
  if (options.dateFrom) query = query.gte("occurred_on", options.dateFrom)
  if (options.dateTo) query = query.lte("occurred_on", options.dateTo)

  const { data: records, error } = await query
  if (error) return { data: null, error }
  const parents = records ?? []
  const relatedParentIds = parents.map((record) => record.id)
  const { data: children, error: childrenError } = relatedParentIds.length === 0
    ? { data: [], error: null }
    : await supabase.from("records").select("id, parent_record_id, amount, source_key").in("parent_record_id", relatedParentIds).is("excluded_at", null).order("source_key", { ascending: true })
  if (childrenError) return { data: null, error: childrenError }
  const relatedIds = [...relatedParentIds, ...(children ?? []).map((child) => child.id)]
  const { data: attributes, error: attributesError } = relatedIds.length === 0
    ? { data: [], error: null }
    : await supabase.from("record_attributes").select("record_id, field_key, value, value_numeric").in("record_id", relatedIds)
  if (attributesError) return { data: null, error: attributesError }

  const attributeByRecord = new Map<string, Map<string, { value: unknown; value_numeric: unknown }>>()
  for (const attribute of attributes ?? []) {
    const fields = attributeByRecord.get(attribute.record_id) ?? new Map()
    fields.set(attribute.field_key, { value: attribute.value, value_numeric: attribute.value_numeric })
    attributeByRecord.set(attribute.record_id, fields)
  }
  const childrenByParent = new Map<string, typeof children>()
  for (const child of children ?? []) {
    childrenByParent.set(child.parent_record_id, [...(childrenByParent.get(child.parent_record_id) ?? []), child])
  }

  return {
    data: parents.map((record) => {
      const fields = attributeByRecord.get(record.id) ?? new Map()
      const lineItems = (childrenByParent.get(record.id) ?? []).map((child) => ({
        ...Object.fromEntries(Array.from(attributeByRecord.get(child.id) ?? new Map()).filter(([key]) => key !== "line_items").map(([key, entry]) => [key, entry.value])),
        amount: child.amount,
        quantity: attributeByRecord.get(child.id)?.get("quantity")?.value ?? null,
      }))
      return {
        file_id: record.file_id,
        document_date: record.occurred_on,
        total_amount: record.amount,
        gross_income: numberAttribute(fields.get("gross_income")),
        net_income: numberAttribute(fields.get("net_income")),
        expense_category: record.category,
        merchant_domain: fields.get("merchant_domain")?.value ?? null,
        currency: record.currency,
        normalization_status: "normalized" as const,
        // The dashboard never consumes raw model/provider output.
        raw_json: null,
        vendor_normalized: record.counterparty_normalized,
        merchant_address_region: fields.get("merchant_address_region")?.value ?? null,
        is_recurring: record.is_recurring,
        line_items: lineItems,
        files: record.files,
      }
    }),
    error: null,
  }
}

function numberAttribute(attribute: { value: unknown; value_numeric: unknown } | undefined): number | null {
  const value = attribute?.value_numeric ?? attribute?.value
  if (value === null || value === undefined || value === "") return null
  const number = typeof value === "number" ? value : Number(value)
  return Number.isFinite(number) ? number : null
}
