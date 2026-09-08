export type KnownQuarantinedFile = {
  id: string
  scan_reason: string | null
}

type FilesClient = {
  // Supabase's PostgREST builder is PromiseLike rather than a native Promise.
  // Keep this narrow helper independent of generated database types.
  from(table: string): any
}

export async function findKnownQuarantinedFile(
  client: FilesClient,
  userId: string,
  sha256: string,
): Promise<KnownQuarantinedFile | null> {
  const { data, error } = await client
    .from("files")
    .select("id, scan_reason")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .eq("upload_status", "quarantined")
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`Known-quarantined-hash lookup failed: ${error.message ?? "unknown database error"}`)
  }
  return data as KnownQuarantinedFile | null
}
