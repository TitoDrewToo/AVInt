export type ExistingFileMatch = { id: string; filename: string; created_at: string }

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function findExistingFileBySha(client: { from: (table: string) => any }, userId: string, sha256: string, excludeFileId?: string): Promise<ExistingFileMatch | null> {
  let query = client.from("files").select("id, filename, created_at").eq("user_id", userId).eq("sha256", sha256).neq("upload_status", "quarantined").order("created_at", { ascending: true }).limit(1)
  if (excludeFileId) query = query.neq("id", excludeFileId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data ?? null
}
