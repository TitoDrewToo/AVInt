import { applyOverrides } from "./apply-overrides.ts"
import type { DerivedAttribute, DerivedRecord, DeriveResult } from "./derive-records.ts"

type QueryClient = { from: (table: string) => any }

type PersistResult = { inserted: number; updated: number }

function assertNoError(error: { message?: string } | null, operation: string) {
  if (error) throw new Error(`${operation} failed: ${error.message ?? String(error)}`)
}

function recordPayload(record: DerivedRecord, extractionId: string, parentRecordId: string | null) {
  return {
    extraction_id: extractionId,
    file_id: record.file_id,
    user_id: record.user_id,
    parent_record_id: parentRecordId,
    source_key: record.source_key,
    record_type: record.record_type,
    occurred_on: record.occurred_on,
    amount: record.amount,
    currency: record.currency,
    direction: record.direction,
    counterparty: record.counterparty,
    counterparty_normalized: record.counterparty_normalized,
    category: record.category,
    period_start: record.period_start,
    period_end: record.period_end,
    is_recurring: record.is_recurring,
    confidence: record.confidence,
    field_confidence: record.field_confidence,
    needs_review: record.needs_review,
  }
}

async function existingKeys(client: QueryClient, fileId: string, sourceKeys: string[]) {
  if (sourceKeys.length === 0) return new Set<string>()
  const { data, error } = await client.from("records").select("source_key").eq("file_id", fileId).in("source_key", sourceKeys)
  assertNoError(error, "existing records query")
  return new Set<string>((data ?? []).map((row: { source_key: string }) => row.source_key))
}

async function upsertRecords(client: QueryClient, payloads: Record<string, unknown>[]) {
  if (payloads.length === 0) return []
  const { data, error } = await client
    .from("records")
    .upsert(payloads, { onConflict: "file_id,source_key" })
    .select("id, source_key, parent_record_id")
  assertNoError(error, "records upsert")
  if (!Array.isArray(data) || data.length !== payloads.length) throw new Error("records upsert returned an incomplete result")
  return data as Array<{ id: string; source_key: string; parent_record_id: string | null }>
}

function attributePayload(attribute: DerivedAttribute, recordId: string) {
  return {
    user_id: attribute.user_id,
    record_id: recordId,
    field_key: attribute.field_key,
    value: attribute.value,
    value_type: attribute.value_type,
    confidence: attribute.confidence,
  }
}

export async function persistDerived(
  client: QueryClient,
  extractionId: string,
  derived: DeriveResult,
): Promise<PersistResult> {
  if (!extractionId) throw new Error("extractionId is required")
  const parents = derived.records.filter((record) => !record.parent_source_key)
  const children = derived.records.filter((record) => Boolean(record.parent_source_key))
  const fileId = derived.records[0]?.file_id
  if (!fileId && derived.records.length > 0) throw new Error("derived records must include file_id")

  const existing = fileId ? await existingKeys(client, fileId, derived.records.map((record) => record.source_key)) : new Set<string>()
  const parentRows = await upsertRecords(client, parents.map((record) => recordPayload(record, extractionId, null)))
  const parentIds = new Map(parentRows.map((row) => [row.source_key, row.id]))
  for (const parent of parents) {
    if (!parentIds.has(parent.source_key)) throw new Error(`parent record id missing for ${parent.source_key}`)
  }

  const childPayloads = children.map((child) => {
    const parentId = child.parent_source_key ? parentIds.get(child.parent_source_key) : undefined
    if (!parentId) throw new Error(`parent record id missing for child ${child.source_key}`)
    return recordPayload(child, extractionId, parentId)
  })
  const childRows = await upsertRecords(client, childPayloads)

  const recordIds = new Map([...parentRows, ...childRows].map((row) => [row.source_key, row.id]))
  const attributes = derived.attributes
    .map((attribute) => {
      const recordId = recordIds.get(attribute.source_key)
      if (!recordId) throw new Error(`record id missing for attribute ${attribute.source_key}.${attribute.field_key}`)
      return attributePayload(attribute, recordId)
    })
  if (attributes.length > 0) {
    const { error } = await client.from("record_attributes").upsert(attributes, { onConflict: "record_id,field_key" })
    assertNoError(error, "record attributes upsert")
  }

  if (fileId) {
    const { count, error } = await client
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileId)
      .not("parent_record_id", "is", null)
    assertNoError(error, "child record count assertion")
    if ((count ?? 0) < children.length) throw new Error(`child record count assertion failed: expected at least ${children.length}, got ${count ?? 0}`)
  }

  await applyOverrides(client, [...recordIds.values()])
  const inserted = derived.records.filter((record) => !existing.has(record.source_key)).length
  return { inserted, updated: derived.records.length - inserted }
}
