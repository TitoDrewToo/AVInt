import { supabaseAdmin } from "@/lib/mcp-auth"
import { findOrphanedInboxObjects, type InboxObject } from "@/lib/storage-reconciliation"

const REFERENCE_BATCH_SIZE = 100
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000
const MIN_STALE_HOURS = 1

export type ReconcileInboxOptions = {
  dryRun?: boolean
  limit?: number
  staleHours?: number
}

export async function reconcileOrphanedInboxObjects(options: ReconcileInboxOptions = {}) {
  const dryRun = options.dryRun ?? true
  const requestedLimit = typeof options.limit === "number" && Number.isFinite(options.limit) ? options.limit : DEFAULT_LIMIT
  const requestedStaleHours = typeof options.staleHours === "number" && Number.isFinite(options.staleHours) ? options.staleHours : MIN_STALE_HOURS
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
  const staleHours = Math.max(requestedStaleHours, MIN_STALE_HOURS)
  const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000)

  const { data: objects, error: objectsError } = await supabaseAdmin
    .schema("storage")
    .from("objects")
    .select("name, created_at")
    .eq("bucket_id", "documents")
    .like("name", "%/_inbox/%")
    .lt("created_at", staleBefore.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit)

  if (objectsError) throw new Error(objectsError.message)

  const candidates = (objects ?? []) as InboxObject[]
  const referencedPaths = new Set<string>()
  for (let start = 0; start < candidates.length; start += REFERENCE_BATCH_SIZE) {
    const names = candidates.slice(start, start + REFERENCE_BATCH_SIZE).map((object) => object.name)
    const { data: references, error: referenceError } = await supabaseAdmin
      .from("files")
      .select("storage_path")
      .in("storage_path", names)
    if (referenceError) throw new Error(referenceError.message)
    for (const reference of references ?? []) {
      if (typeof reference.storage_path === "string") referencedPaths.add(reference.storage_path)
    }
  }

  const orphaned = findOrphanedInboxObjects(candidates, referencedPaths, staleBefore)
  let deleted = 0
  if (!dryRun && orphaned.length > 0) {
    const { error: deleteError } = await supabaseAdmin.storage.from("documents").remove(orphaned.map((object) => object.name))
    if (deleteError) throw new Error(deleteError.message)
    deleted = orphaned.length
  }

  return {
    dryRun,
    stale_before: staleBefore.toISOString(),
    scanned: candidates.length,
    orphaned: orphaned.length,
    deleted,
    paths: orphaned.map((object) => object.name),
  }
}
