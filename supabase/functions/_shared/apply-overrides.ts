import { RECORD_FIELD_SET } from "../../../lib/correction-contract.ts"

type QueryClient = { from: (table: string) => any }

function revisionValue(revision: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(revision, "new_value")) {
    throw new Error(`record revision ${String(revision.id ?? "unknown")} has no new_value`)
  }
  return revision.new_value
}

function attributeValueType(value: unknown) {
  if (value === null) return "null"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (Array.isArray(value)) return "array"
  if (typeof value === "object") return "object"
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return "date"
  return "string"
}

function attributePayload(value: unknown, userId: string, recordId: string, fieldKey: string) {
  const valueType = attributeValueType(value)
  return {
    user_id: userId,
    record_id: recordId,
    field_key: fieldKey,
    value,
    value_type: valueType,
    value_numeric: valueType === "number" && typeof value === "number" && Number.isFinite(value) ? value : null,
    is_custom: false,
  }
}

export async function applyOverrides(client: QueryClient, recordIds: string[]): Promise<number> {
  if (recordIds.length === 0) return 0
  const { data: revisions, error: revisionsError } = await client
    .from("record_revisions")
    .select("id, record_id, revision_number, target_kind, target, new_value, change_kind")
    .in("record_id", recordIds)
    .in("change_kind", ["user_edit", "reclassify", "rollback"])
    .order("revision_number", { ascending: false })
  if (revisionsError) throw new Error(`record revisions query failed: ${revisionsError.message}`)

  const latest = new Map<string, Record<string, unknown>>()
  for (const revision of (revisions ?? []) as Record<string, unknown>[]) {
    const recordId = typeof revision.record_id === "string" ? revision.record_id : null
    const targetKind = revision.target_kind === "column" || revision.target_kind === "attribute" ? revision.target_kind : null
    const target = typeof revision.target === "string" && revision.target.length > 0 ? revision.target : null
    if (!recordId || !targetKind || !target || latest.has(`${recordId}:${targetKind}:${target}`)) continue
    latest.set(`${recordId}:${targetKind}:${target}`, revision)
  }

  const columnValues = new Map<string, Record<string, unknown>>()
  const attributeRevisions: Array<{ recordId: string; target: string; value: unknown }> = []
  for (const revision of latest.values()) {
    if (revision.change_kind === "rollback") continue
    const recordId = revision.record_id as string
    const target = revision.target as string
    const value = revisionValue(revision)
    if (revision.target_kind === "column") {
      if (!RECORD_FIELD_SET.has(target)) throw new Error(`unsupported record column revision target: ${target}`)
      const values = columnValues.get(recordId) ?? {}
      values[target] = value
      columnValues.set(recordId, values)
    } else {
      attributeRevisions.push({ recordId, target, value })
    }
  }

  const userIds = new Map<string, string>()
  const existingAttributes = new Map<string, boolean>()
  if (attributeRevisions.length > 0) {
    const { data: records, error: recordsError } = await client.from("records").select("id, user_id").in("id", recordIds)
    if (recordsError) throw new Error(`record owners query failed: ${recordsError.message}`)
    for (const record of records ?? []) userIds.set(record.id, record.user_id)
    const { data: attributes, error: attributesQueryError } = await client
      .from("record_attributes")
      .select("record_id, field_key, is_custom")
      .in("record_id", recordIds)
    if (attributesQueryError) throw new Error(`record attributes query failed: ${attributesQueryError.message}`)
    for (const attribute of attributes ?? []) existingAttributes.set(`${attribute.record_id}:${attribute.field_key}`, attribute.is_custom === true)
    const payload = attributeRevisions.map(({ recordId, target, value }) => {
      const userId = userIds.get(recordId)
      if (!userId) throw new Error(`record owner missing for attribute revision ${recordId}:${target}`)
      const payload = attributePayload(value, userId, recordId, target)
      payload.is_custom = existingAttributes.has(`${recordId}:${target}`) ? existingAttributes.get(`${recordId}:${target}`) === true : true
      return payload
    })
    const { error: attributesError } = await client.from("record_attributes").upsert(payload, { onConflict: "record_id,field_key" })
    if (attributesError) throw new Error(`record attribute override upsert failed: ${attributesError.message}`)
  }

  const activeEditedRecordIds = new Set<string>([...columnValues.keys(), ...attributeRevisions.map((revision) => revision.recordId)])
  const touchedRecordIds = new Set<string>([...latest.values()].map((revision) => revision.record_id as string))
  for (const recordId of touchedRecordIds) {
    const { error: updateError } = await client.from("records").update({ ...(columnValues.get(recordId) ?? {}), has_user_edits: activeEditedRecordIds.has(recordId) }).eq("id", recordId)
    if (updateError) throw new Error(`record override update failed: ${updateError.message}`)
  }
  return activeEditedRecordIds.size
}
