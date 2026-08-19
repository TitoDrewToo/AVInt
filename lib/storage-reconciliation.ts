const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type InboxObject = {
  name: string
  created_at: string | null
}

export type ReconciliationCandidate = InboxObject & {
  reason: "unreferenced-stale-inbox-object"
}

export function isReconciliationSafeInboxPath(name: string): boolean {
  const [userId, scope, ...filename] = name.split("/")
  return UUID_PATTERN.test(userId) && scope === "_inbox" && filename.length === 1 && filename[0].length > 0
}

export function findOrphanedInboxObjects(
  objects: InboxObject[],
  referencedPaths: Set<string>,
  staleBefore: Date,
): ReconciliationCandidate[] {
  return objects.filter((object) => {
    if (!isReconciliationSafeInboxPath(object.name)) return false
    if (referencedPaths.has(object.name)) return false
    if (!object.created_at) return false
    return new Date(object.created_at).getTime() < staleBefore.getTime()
  }).map((object) => ({ ...object, reason: "unreferenced-stale-inbox-object" as const }))
}
