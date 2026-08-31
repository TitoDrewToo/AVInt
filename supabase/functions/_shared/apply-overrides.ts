type QueryClient = { from: (table: string) => any }

const RECORD_FIELDS = new Set([
  "occurred_on", "amount", "currency", "direction", "counterparty", "counterparty_normalized",
  "category", "period_start", "period_end", "is_recurring", "record_type", "confidence", "field_confidence", "needs_review",
])

function revisionValue(revision: Record<string, unknown>) {
  return revision.new_value ?? revision.value ?? revision.next_value
}

export async function applyOverrides(client: QueryClient, recordIds: string[]): Promise<number> {
  if (recordIds.length === 0) return 0
  const { data: revisions, error } = await client
    .from("record_revisions")
    .select("*")
    .in("record_id", recordIds)
    .eq("change_kind", "user_edit")
    .order("created_at", { ascending: false })
  if (error) throw new Error(`record revisions query failed: ${error.message}`)

  const latest = new Map<string, Record<string, unknown>>()
  for (const revision of (revisions ?? []) as Record<string, unknown>[]) {
    const field = typeof revision.field_key === "string" ? revision.field_key : null
    const recordId = typeof revision.record_id === "string" ? revision.record_id : null
    if (!field || !recordId || latest.has(`${recordId}:${field}`)) continue
    latest.set(`${recordId}:${field}`, revision)
  }

  const byRecord = new Map<string, Record<string, unknown>>()
  for (const revision of latest.values()) {
    const field = revision.field_key as string
    const recordId = revision.record_id as string
    if (!RECORD_FIELDS.has(field)) continue
    const values = byRecord.get(recordId) ?? {}
    values[field] = revisionValue(revision)
    byRecord.set(recordId, values)
  }

  for (const [recordId, values] of byRecord) {
    const { error: updateError } = await client.from("records").update({ ...values, has_user_edits: true }).eq("id", recordId)
    if (updateError) throw new Error(`record override update failed: ${updateError.message}`)
  }
  return byRecord.size
}
