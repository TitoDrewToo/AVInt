import { supabaseAdmin } from "@/lib/mcp-auth"
import { descendantFolderIds } from "@/lib/report-folder-scope"

export class InvalidReportFolderError extends Error {
  constructor() {
    super("The requested folder does not belong to this account")
    this.name = "InvalidReportFolderError"
  }
}

export async function resolveReportFolderScope(userId: string, targetFolder?: string | null) {
  if (!targetFolder) return null

  const { data, error } = await supabaseAdmin
    .from("folders")
    .select("id, parent_id")
    .eq("user_id", userId)

  if (error) throw new Error(error.message)
  const folders = data ?? []
  if (!folders.some((folder) => folder.id === targetFolder)) {
    throw new InvalidReportFolderError()
  }

  return { folderIds: descendantFolderIds(folders, targetFolder) }
}

export async function getReportFileIds(userId: string, documentTypes: string[], targetFolder?: string | null) {
  const scope = await resolveReportFolderScope(userId, targetFolder)
  let query = supabaseAdmin
    .from("files")
    .select("id")
    .eq("user_id", userId)

  if (documentTypes.length > 0) query = query.in("document_type", documentTypes)
  if (scope) query = query.in("folder_id", scope.folderIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id)
}
