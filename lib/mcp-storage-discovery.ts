import { supabaseAdmin } from "@/lib/mcp-auth"

export async function requireOwnedFolder(userId: string, folderId: string) {
  const { data, error } = await supabaseAdmin.from("folders").select("id").eq("id", folderId).eq("user_id", userId).maybeSingle()
  if (error) throw error
  if (!data) throw new TypeError("Folder does not exist or is not accessible")
}

export async function listStorageResources(userId: string, kind: "files" | "folders", page: number, pageSize: number, search?: string) {
  let query = supabaseAdmin.from(kind).select(kind === "files" ? "id, filename, file_type, folder_id, upload_status, scan_reason, created_at" : "id, name, parent_id, created_at", { count: "exact" }).eq("user_id", userId)
  if (search) query = query.ilike(kind === "files" ? "filename" : "name", `%${search.replace(/[\\%_]/g, "\\$&")}%`)
  const { data, error, count } = await query.order("created_at", { ascending: true }).order("id", { ascending: true }).range(page * pageSize, (page + 1) * pageSize - 1)
  if (error) throw error
  const total = count ?? 0
  return { [kind]: data ?? [], page, pageSize, total, nextPage: (page + 1) * pageSize < total ? page + 1 : null }
}

export async function createOwnedFolder(userId: string, name: string, parentId?: string) {
  if (parentId) await requireOwnedFolder(userId, parentId)
  const { data, error } = await supabaseAdmin.from("folders").insert({ user_id: userId, name: name.trim(), parent_id: parentId ?? null }).select("id, name, parent_id").single()
  if (error) throw error
  return data
}
