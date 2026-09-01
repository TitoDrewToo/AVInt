import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_CONTEXT_ROWS = 120

export async function buildDashboardAIContext(userId: string) {
  const [{ data: files, error: filesError }, { data: fields, error: fieldsError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", userId),
    supabaseAdmin
      .from("records")
      .select("id, file_id, source_key, occurred_on, amount, currency, category, counterparty_normalized, parent_record_id, excluded_at, files!inner(document_type, filename, user_id)")
      .eq("user_id", userId)
      .is("parent_record_id", null)
      .is("excluded_at", null)
      .order("occurred_on", { ascending: false })
      .order("source_key", { ascending: true })
      .limit(MAX_CONTEXT_ROWS),
  ])
  if (filesError) throw new Error(filesError.message)
  if (fieldsError) throw new Error(fieldsError.message)

  const readyRows = fields ?? []
  const recordIds = readyRows.map((row) => row.id)
  const { data: attributes, error: attributesError } = recordIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value, value_numeric").in("record_id", recordIds)
  if (attributesError) throw new Error(attributesError.message)
  const attributeByRecord = new Map<string, Map<string, { value: unknown; value_numeric: unknown }>>()
  for (const attribute of attributes ?? []) {
    const fieldsForRecord = attributeByRecord.get(attribute.record_id) ?? new Map()
    fieldsForRecord.set(attribute.field_key, { value: attribute.value, value_numeric: attribute.value_numeric })
    attributeByRecord.set(attribute.record_id, fieldsForRecord)
  }
  const typeCounts = new Map<string, number>()
  const currencyCounts = new Map<string, number>()
  for (const row of readyRows) {
    const file = Array.isArray(row.files) ? row.files[0] : row.files
    const type = file?.document_type ?? "general_document"
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
    if (row.currency) currencyCounts.set(row.currency, (currencyCounts.get(row.currency) ?? 0) + 1)
  }

  return {
    sourceCount: files?.length ?? 0,
    readyRecordCount: readyRows.length,
    attentionCount: (files ?? []).filter((file: any) => ["processing", "pending_scan", "scanning", "approved"].includes(file.upload_status)).length,
    documentTypes: Object.fromEntries(typeCounts),
    currencies: Object.fromEntries(currencyCounts),
    recentRecords: readyRows.slice(0, 40).map((row) => {
      const file = Array.isArray(row.files) ? row.files[0] : row.files
      const attributesForRow = attributeByRecord.get(row.id)
      return {
        date: row.occurred_on,
        vendor: row.counterparty_normalized ?? attributesForRow?.get("vendor_name")?.value ?? null,
        type: file?.document_type ?? "general_document",
        amount: row.amount ?? attributesForRow?.get("gross_income")?.value_numeric ?? attributesForRow?.get("gross_income")?.value ?? attributesForRow?.get("net_income")?.value_numeric ?? attributesForRow?.get("net_income")?.value ?? null,
        currency: row.currency ?? null,
        category: row.category ?? null,
        merchantDomain: attributesForRow?.get("merchant_domain")?.value ?? null,
      }
    }),
  }
}
