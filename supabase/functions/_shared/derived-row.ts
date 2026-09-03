type QueryClient = { from: (table: string) => any }

function sourceKeyForIndex(payload: unknown, index: number): string {
  return Array.isArray(payload) || (payload && typeof payload === "object" && ("rows" in payload || "records" in payload))
    ? String(index)
    : "root"
}

function payloadRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const value = (payload as Record<string, unknown>).rows ?? (payload as Record<string, unknown>).records
    if (Array.isArray(value)) return value
  }
  return [payload]
}

function attributesObject(attributes: any[]): Record<string, unknown> {
  return Object.fromEntries((attributes ?? []).map((attribute) => [attribute.field_key, attribute.value]))
}

export async function loadDerivedRow(client: QueryClient, fileId: string, sourceKey?: string): Promise<any | null> {
  const { data: extractions, error: extractionError } = await client
    .from("extractions")
    .select("id, payload, document_type, attempt_number, status, created_at")
    .eq("file_id", fileId)
    .eq("status", "succeeded")
    .order("attempt_number", { ascending: true })
  if (extractionError) throw new Error(`extractions query error: ${extractionError.message}`)
  const initial = (extractions ?? []).find((row: any) => row.attempt_number === 1)
  if (!initial) return null
  const rows = payloadRows(initial.payload)
  const index = sourceKey && sourceKey !== "root" ? Number(sourceKey) : 0
  const key = sourceKey ?? sourceKeyForIndex(initial.payload, index)
  const extracted = rows[index] ?? rows[0]
  if (!extracted || typeof extracted !== "object") return null

  const { data: record, error: recordError } = await client
    .from("records")
    .select("*")
    .eq("file_id", fileId)
    .eq("source_key", key)
    .is("parent_record_id", null)
    .maybeSingle()
  if (recordError) throw new Error(`records query error: ${recordError.message}`)
  if (!record) return null

  const { data: attributes, error: attributesError } = await client
    .from("record_attributes")
    .select("field_key, value, value_type")
    .eq("record_id", record.id)
  if (attributesError) throw new Error(`record_attributes query error: ${attributesError.message}`)

  const extractedRow = extracted as Record<string, unknown>
  const fields: Record<string, unknown> = {
    ...extractedRow,
    ...attributesObject(attributes ?? []),
    id: record.id,
    file_id: fileId,
    source_key: key,
    document_date: record.occurred_on ?? extractedRow.document_date ?? null,
    currency: record.currency ?? extractedRow.currency ?? null,
    total_amount: record.record_type === "payslip" ? null : record.amount ?? extractedRow.total_amount ?? null,
    gross_income: record.record_type === "payslip" ? record.amount ?? extractedRow.gross_income ?? null : extractedRow.gross_income ?? null,
    expense_category: record.category ?? extractedRow.expense_category ?? null,
    confidence_score: record.confidence ?? extractedRow.confidence_score ?? extractedRow.confidence ?? null,
    normalization_attempts: 0,
    raw_json: { gemini_raw: extractedRow },
  }
  return fields
}

export function sourceRowsFromExtraction(payload: unknown): Array<{ sourceKey: string; row: any }> {
  return payloadRows(payload)
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
    .map((row, index) => ({ sourceKey: sourceKeyForIndex(payload, index), row }))
}
