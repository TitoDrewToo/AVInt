type SupabaseLike = {
  from: (table: string) => any
}

type VirtualField = {
  field_key: string
  value: unknown
  value_type: "string" | "number" | "boolean" | "date" | "array" | "object" | "null"
  confidence: number | null
  is_custom: boolean
  source_evidence: Record<string, unknown>
}

const CANONICAL_FIELDS = [
  "vendor_name", "vendor_normalized", "employer_name", "document_date", "currency",
  "jurisdiction", "total_amount", "gross_income", "net_income", "tax_amount",
  "discount_amount", "expense_category", "income_source", "classification_rationale",
  "invoice_number", "payment_method", "period_start", "period_end", "counterparty_name",
  "merchant_domain", "merchant_address_city", "merchant_address_region",
  "merchant_address_country", "is_recurring", "recurrence_cadence", "line_items",
] as const

function inferType(value: unknown, key: string): VirtualField["value_type"] {
  if (value === null || value === undefined) return "null"
  if (Array.isArray(value)) return "array"
  if (typeof value === "boolean") return "boolean"
  if (typeof value === "number") return "number"
  if (typeof value === "object") return "object"
  if (/(^|_)(date|start|end)$/.test(key) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) return "date"
  return "string"
}

function labelFor(key: string) {
  return key.replace(/^custom:/, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function sourceEvidence(row: any): Record<string, unknown> {
  const raw = row.raw_json ?? {}
  const sourceRow = raw.source_row
  const evidence: Record<string, unknown> = { source_kind: "document" }
  const providedEvidence = raw.source_evidence
  if (providedEvidence && typeof providedEvidence === "object" && !Array.isArray(providedEvidence)) {
    for (const key of ["page", "page_number", "text_span", "bbox", "cell_range", "column", "sheet_name", "row_index"]) {
      const value = providedEvidence[key]
      if (value !== null && value !== undefined) evidence[key] = value
    }
  }
  if (raw.source_sheet || sourceRow?.sheet_name) {
    evidence.source_kind = "spreadsheet"
    evidence.sheet_name = raw.source_sheet ?? sourceRow.sheet_name
  }
  if (raw.source_index !== undefined) evidence.source_index = raw.source_index
  if (sourceRow?.row_index !== undefined) evidence.row_index = sourceRow.row_index
  if (sourceRow?.cells && typeof sourceRow.cells === "object" && !Array.isArray(sourceRow.cells)) {
    evidence.columns = Object.keys(sourceRow.cells)
  }
  if (raw.page !== undefined) {
    evidence.source_kind = "page"
    evidence.page = raw.page
  }
  return evidence
}

function customFields(row: any): Record<string, unknown> {
  const raw = row.raw_json ?? {}
  const candidates = [raw.custom_fields, raw.gemini_raw?._custom_fields, raw.normalization_enriched?.custom_fields]
  return candidates.reduce<Record<string, unknown>>((all, candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return all
    for (const [key, value] of Object.entries(candidate)) {
      if (key.trim()) all[key.trim()] = value
    }
    return all
  }, {})
}

function fieldsFromRow(row: any): VirtualField[] {
  const evidence = sourceEvidence(row)
  const confidence = typeof row.confidence_score === "number" ? row.confidence_score : null
  const fields: VirtualField[] = []
  for (const key of CANONICAL_FIELDS) {
    const value = row[key]
    if (value === null || value === undefined) continue
    fields.push({ field_key: key, value, value_type: inferType(value, key), confidence, is_custom: false, source_evidence: evidence })
  }
  for (const [key, value] of Object.entries(customFields(row))) {
    if (value === null || value === undefined) continue
    const fieldKey = `custom:${key}`
    fields.push({ field_key: fieldKey, value, value_type: inferType(value, fieldKey), confidence, is_custom: true, source_evidence: { ...evidence, source_kind: "custom" } })
  }
  return fields
}

function sourceKinds(fields: VirtualField[]) {
  return [...new Set(fields.map((field) => String(field.source_evidence.source_kind ?? "document")))]
}

export async function syncVirtualRecord(supabase: SupabaseLike, row: any, file: any) {
  if (!row?.id || !file?.user_id) return

  const recordPayload = {
    user_id: file.user_id,
    file_id: row.file_id,
    source_record_id: row.id,
    document_type: file.document_type ?? "general_document",
    record_type: file.document_type ? `${file.document_type}_record` : "document_record",
    status: row.normalization_status ?? "raw",
    normalization_version: row.normalization_version ?? null,
    is_current: true,
  }
  const { data: record, error: recordError } = await supabase
    .from("virtual_records")
    .upsert(recordPayload, { onConflict: "source_record_id" })
    .select("id")
    .single()
  if (recordError) throw new Error(`virtual record upsert failed: ${recordError.message}`)

  const fields = fieldsFromRow(row)
  const { error: deleteError } = await supabase.from("virtual_record_fields").delete().eq("virtual_record_id", record.id)
  if (deleteError) throw new Error(`virtual record field reset failed: ${deleteError.message}`)
  if (fields.length) {
    const { error: fieldsError } = await supabase.from("virtual_record_fields").insert(fields.map((field) => ({
      ...field,
      user_id: file.user_id,
      virtual_record_id: record.id,
    })))
    if (fieldsError) throw new Error(`virtual record fields insert failed: ${fieldsError.message}`)
  }

  // Keep an append-only projection history alongside the current record. The
  // history migration is additive, so older deployments can continue serving
  // the current projection while the new tables are being rolled out.
  try {
    const { data: latestVersion } = await supabase
      .from("virtual_record_versions")
      .select("version_number")
      .eq("virtual_record_id", record.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    const versionNumber = (latestVersion?.version_number ?? 0) + 1
    const { data: version, error: versionError } = await supabase
      .from("virtual_record_versions")
      .insert({
        user_id: file.user_id,
        virtual_record_id: record.id,
        source_record_id: row.id,
        version_number: versionNumber,
        document_type: recordPayload.document_type,
        record_type: recordPayload.record_type,
        status: recordPayload.status,
        normalization_version: recordPayload.normalization_version,
        change_reason: row.normalization_status === "manual" ? "manual_correction" : "projection_sync",
      })
      .select("id")
      .single()
    if (versionError || !version) throw new Error(versionError?.message ?? "version row not returned")
    if (fields.length) {
      const { error: versionFieldsError } = await supabase.from("virtual_record_version_fields").insert(fields.map((field) => ({
        ...field,
        user_id: file.user_id,
        version_id: version.id,
      })))
      if (versionFieldsError) throw new Error(versionFieldsError.message)
    }
  } catch (historyError) {
    // History must not turn a successful current projection into a failed
    // ingestion request during staged rollout. The error remains observable.
    console.error("virtual record history sync failed", {
      source_record_id: row.id,
      error: historyError instanceof Error ? historyError.message : String(historyError),
    })
  }

  const now = new Date().toISOString()
  for (const field of fields) {
    const { data: existing } = await supabase
      .from("virtual_field_catalog")
      .select("value_types, occurrence_count, source_kinds")
      .eq("user_id", file.user_id)
      .eq("field_key", field.field_key)
      .maybeSingle()
    const { count } = await supabase
      .from("virtual_record_fields")
      .select("id", { count: "exact", head: true })
      .eq("user_id", file.user_id)
      .eq("field_key", field.field_key)
    const valueTypes = [...new Set([...(existing?.value_types ?? []), field.value_type])]
    const kinds = [...new Set([...(existing?.source_kinds ?? []), ...sourceKinds([field])])]
    const { error: catalogError } = await supabase.from("virtual_field_catalog").upsert({
      user_id: file.user_id,
      field_key: field.field_key,
      label: labelFor(field.field_key),
      value_types: valueTypes,
      occurrence_count: count ?? 0,
      is_custom: field.is_custom,
      source_kinds: kinds,
      last_seen: now,
    }, { onConflict: "user_id,field_key" })
    if (catalogError) throw new Error(`virtual field catalog upsert failed: ${catalogError.message}`)
  }
}
