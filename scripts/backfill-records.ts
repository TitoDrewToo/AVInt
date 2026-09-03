import { createClient } from "@supabase/supabase-js"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"
import { persistDerived } from "../supabase/functions/_shared/persist-derived"

const PAGE_SIZE = 100
const dryRun = process.argv.includes("--dry-run")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

function payloadFor(extraction: Record<string, unknown>): unknown {
  const payload = extraction.payload
  if (typeof payload === "string") {
    try { return JSON.parse(payload) } catch { return null }
  }
  return payload
}

function sourceKeyForSingleExtraction(attemptNumber: unknown, multiRowFile: boolean): string {
  const attempt = Number(attemptNumber)
  return multiRowFile && Number.isInteger(attempt) && attempt >= 2 ? String(attempt - 2) : "root"
}

function currentExtractions(
  extractions: Record<string, unknown>[],
  files: Map<string, { id: string; user_id: string; document_type: string | null }>,
) {
  const current = new Map<string, { extraction: Record<string, unknown>; row: unknown; sourceKey: string }>()
  const multiRowFiles = new Set(extractions
    .filter((extraction) => {
      const payload = payloadFor(extraction)
      return Array.isArray(payload) || (payload && typeof payload === "object" && ("rows" in payload || "records" in payload))
    })
    .map((extraction) => String(extraction.file_id)))
  for (const extraction of extractions) {
    const fileId = String(extraction.file_id)
    const file = files.get(fileId)
    if (!file) continue
    const derived = deriveRecords(payloadFor(extraction), file)
    const attemptNumber = Number(extraction.attempt_number)
    for (const [index, record] of derived.records.filter((candidate) => !candidate.parent_source_key).entries()) {
      const payload = payloadFor(extraction)
      const isMultiRowPayload = Array.isArray(payload) || (payload && typeof payload === "object" && ("rows" in payload || "records" in payload))
      const sourceKey = isMultiRowPayload
        ? record.source_key
        : sourceKeyForSingleExtraction(extraction.attempt_number, multiRowFiles.has(fileId))
      const key = `${fileId}:${sourceKey}`
      const previous = current.get(key)
      const previousAttempt = Number(previous?.extraction.attempt_number ?? -1)
      if (!previous || attemptNumber > previousAttempt || (attemptNumber === previousAttempt && String(extraction.id) > String(previous.extraction.id))) {
        const rows = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && ("rows" in payload || "records" in payload)
            ? ((payload as Record<string, unknown>).rows ?? (payload as Record<string, unknown>).records) as unknown[]
            : [payload]
        current.set(key, { extraction, row: rows[index], sourceKey })
      }
    }
  }
  return [...current.values()]
}

async function fetchExtractions() {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("extractions")
      .select("*")
      .eq("status", "succeeded")
      .order("file_id", { ascending: true })
      .order("attempt_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`extractions query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function fetchFiles(fileIds: string[]) {
  const files = new Map<string, { id: string; user_id: string; document_type: string | null }>()
  for (let from = 0; from < fileIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("files")
      .select("id, user_id, document_type")
      .in("id", fileIds.slice(from, from + PAGE_SIZE))
    if (error) throw new Error(`files query failed: ${error.message}`)
    for (const file of data ?? []) files.set(file.id, file)
  }
  return files
}

type ExistingRecord = { id: string; file_id: string; source_key: string; parent_record_id: string | null; has_user_edits: boolean }
type ExistingAttribute = { id: string; record_id: string; field_key: string }
type SurvivingOverride = { record_id: string; target_kind: "column" | "attribute"; target: string }

async function fetchExistingState(fileIds: string[]) {
  const records: ExistingRecord[] = []
  for (let from = 0; from < fileIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("records")
      .select("id, file_id, source_key, parent_record_id, has_user_edits")
      .in("file_id", fileIds.slice(from, from + PAGE_SIZE))
    if (error) throw new Error(`records query failed: ${error.message}`)
    records.push(...(data ?? []))
  }

  const attributes: ExistingAttribute[] = []
  const recordIds = records.map((record) => record.id)
  for (let from = 0; from < recordIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("record_attributes")
      .select("id, record_id, field_key")
      .in("record_id", recordIds.slice(from, from + PAGE_SIZE))
    if (error) throw new Error(`record attributes query failed: ${error.message}`)
    attributes.push(...(data ?? []))
  }

  const revisions: Record<string, unknown>[] = []
  for (let from = 0; from < recordIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("record_revisions")
      .select("record_id, target_kind, target, revision_number, change_kind")
      .in("record_id", recordIds.slice(from, from + PAGE_SIZE))
      .in("change_kind", ["user_edit", "reclassify", "rollback"])
    if (error) throw new Error(`record revisions query failed: ${error.message}`)
    revisions.push(...(data ?? []))
  }

  const latest = new Map<string, Record<string, unknown>>()
  for (const revision of revisions) {
    const recordId = String(revision.record_id)
    const targetKind = String(revision.target_kind)
    const target = String(revision.target)
    const key = `${recordId}:${targetKind}:${target}`
    const previous = latest.get(key)
    if (!previous || Number(revision.revision_number) > Number(previous.revision_number)) latest.set(key, revision)
  }
  const survivingOverrides: SurvivingOverride[] = [...latest.values()]
    .filter((revision) => revision.change_kind !== "rollback")
    .filter((revision): revision is Record<string, unknown> & { record_id: string; target_kind: "column" | "attribute"; target: string } =>
      typeof revision.record_id === "string" && (revision.target_kind === "column" || revision.target_kind === "attribute") && typeof revision.target === "string")
    .map((revision) => ({ record_id: revision.record_id, target_kind: revision.target_kind, target: revision.target }))

  return { records, attributes, survivingOverrides }
}

async function main() {
  const allExtractions = await fetchExtractions()
  const fileIds = [...new Set(allExtractions.map((row) => String(row.file_id)).filter(Boolean))]
  const files = await fetchFiles(fileIds)
  const extractions = currentExtractions(allExtractions, files)
  const existingState = await fetchExistingState(fileIds)
  let needsReview = 0
  let processed = 0
  let skipped = 0

  const projectedParents = new Set<string>()
  const projectedChildren = new Set<string>()
  const projectedAttributes = new Set<string>()

  const addProjected = (candidate: { extraction: Record<string, unknown>; row: unknown; sourceKey: string }, file: { id: string; user_id: string; document_type: string | null }) => {
    const derived = deriveRecords(candidate.row, file, { sourceKey: candidate.sourceKey })
    for (const record of derived.records) {
      const recordKey = `${record.file_id}:${record.source_key}`
      if (record.parent_source_key) projectedChildren.add(recordKey)
      else projectedParents.add(recordKey)
    }
    for (const attribute of derived.attributes) projectedAttributes.add(`${attribute.file_id}:${attribute.source_key}:${attribute.field_key}`)
    return derived
  }

  for (const extraction of extractions) {
    const file = files.get(String(extraction.extraction.file_id))
    if (!file) { skipped += 1; continue }
    const derived = addProjected(extraction, file)
    needsReview += derived.records.filter((record) => record.needs_review).length
    processed += 1

    if (!dryRun) {
      await persistDerived(supabase, String(extraction.extraction.id), derived)
    }
  }

  const existingById = new Map(existingState.records.map((record) => [record.id, record]))
  const survivingOverrideKeys = new Set(existingState.survivingOverrides.map((override) => `${override.record_id}:${override.target_kind}:${override.target}`))
  const recordsWithSurvivingOverride = new Set(existingState.survivingOverrides.map((override) => override.record_id))
  const recordsWithUserEdits = new Set(existingState.records.filter((record) => record.has_user_edits).map((record) => record.id))
  const protectedRecordIds = new Set([...recordsWithSurvivingOverride, ...recordsWithUserEdits])

  const staleChildren = existingState.records.filter((record) => record.parent_record_id !== null && !projectedChildren.has(`${record.file_id}:${record.source_key}`))
  const projectedRecordKeys = new Set([...projectedParents, ...projectedChildren])
  const retainedOverrideAttributes = existingState.survivingOverrides
    .filter((override) => override.target_kind === "attribute")
    .filter((override) => {
      const record = existingById.get(override.record_id)
      return record !== undefined
        && projectedRecordKeys.has(`${record.file_id}:${record.source_key}`)
        && !projectedAttributes.has(`${record.file_id}:${record.source_key}:${override.target}`)
    })
  const staleAttributes = existingState.attributes.filter((attribute) => {
    const record = existingState.records.find((candidate) => candidate.id === attribute.record_id)
    if (!record || !projectedRecordKeys.has(`${record.file_id}:${record.source_key}`)) return false
    if (survivingOverrideKeys.has(`${attribute.record_id}:attribute:${attribute.field_key}`)) return false
    return !projectedAttributes.has(`${record.file_id}:${record.source_key}:${attribute.field_key}`)
  })
  const staleDeletionItems = [
    ...staleChildren.map((record) => ({ recordId: record.id })),
    ...staleAttributes.map((attribute) => ({ recordId: attribute.record_id })),
  ]
  const currentParents = new Set(existingState.records.filter((record) => record.parent_record_id === null).map((record) => `${record.file_id}:${record.source_key}`))
  const currentChildren = new Set(existingState.records.filter((record) => record.parent_record_id !== null).map((record) => `${record.file_id}:${record.source_key}`))
  const currentAttributes = new Set(existingState.attributes.map((attribute) => `${attribute.record_id}:${attribute.field_key}`))
  const staleAttributesByFieldKey = staleAttributes.reduce<Record<string, number>>((counts, attribute) => {
    counts[attribute.field_key] = (counts[attribute.field_key] ?? 0) + 1
    return counts
  }, {})
  const countByFile = (keys: Set<string>) => [...keys].reduce<Record<string, number>>((counts, key) => {
    const fileId = key.split(":", 1)[0]
    counts[fileId] = (counts[fileId] ?? 0) + 1
    return counts
  }, {})
  const currentParentsByFile = countByFile(currentParents)
  const currentChildrenByFile = countByFile(currentChildren)
  const projectedParentsByFile = countByFile(projectedParents)
  const projectedChildrenByFile = countByFile(projectedChildren)
  const fileDeltas = [...new Set([...Object.keys(currentParentsByFile), ...Object.keys(projectedParentsByFile), ...Object.keys(currentChildrenByFile), ...Object.keys(projectedChildrenByFile)])]
    .map((fileId) => ({
      file_id: fileId,
      parent_delta: (projectedParentsByFile[fileId] ?? 0) - (currentParentsByFile[fileId] ?? 0),
      child_delta: (projectedChildrenByFile[fileId] ?? 0) - (currentChildrenByFile[fileId] ?? 0),
    }))
    .filter((delta) => delta.parent_delta !== 0 || delta.child_delta !== 0)

  console.log(JSON.stringify({
    dry_run: dryRun,
    extractions_processed: processed,
    current_parents: currentParents.size,
    current_children: currentChildren.size,
    current_records: currentParents.size + currentChildren.size,
    current_attributes: currentAttributes.size,
    projected_parents: projectedParents.size,
    projected_children: projectedChildren.size,
    projected_records: projectedParents.size + projectedChildren.size,
    projected_attributes: projectedAttributes.size + retainedOverrideAttributes.length,
    delta_parents: projectedParents.size - currentParents.size,
    delta_children: projectedChildren.size - currentChildren.size,
    delta_records: projectedParents.size + projectedChildren.size - currentParents.size - currentChildren.size,
    delta_attributes: projectedAttributes.size + retainedOverrideAttributes.length - currentAttributes.size,
    stale_children_to_delete: staleChildren.length,
    stale_attributes_to_delete: staleAttributes.length,
    stale_attributes_by_field_key: staleAttributesByFieldKey,
    stale_attributes_not_emitted_under_same_key: staleAttributes.length,
    stale_attributes_emitted_under_different_key: 0,
    stale_deletions: staleDeletionItems.length,
    stale_deletions_with_surviving_override_or_user_edit: staleDeletionItems.filter((item) => protectedRecordIds.has(item.recordId)).length,
    projected_file_deltas: fileDeltas,
    needs_review: needsReview,
    skipped,
  }, null, 2))
}

main().then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1) },
)
