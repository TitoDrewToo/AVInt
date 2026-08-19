type FolderRow = { id: string; parent_id: string | null }

export function folderBelongsToUser(folders: FolderRow[], folderId: string): boolean {
  return folders.some((folder) => folder.id === folderId)
}

/** Return a folder and every descendant, without trusting client-provided ancestry. */
export function descendantFolderIds(folders: FolderRow[], rootId: string): string[] {
  const childrenByParent = new Map<string | null, string[]>()
  for (const folder of folders) {
    const parentId = folder.parent_id ?? null
    childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), folder.id])
  }

  const queue = [rootId]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const folderId = queue.shift()!
    if (seen.has(folderId)) continue
    seen.add(folderId)
    queue.push(...(childrenByParent.get(folderId) ?? []))
  }
  return Array.from(seen)
}
