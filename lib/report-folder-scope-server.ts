import { supabaseAdmin } from "@/lib/mcp-auth"
import { readComplete } from "@/lib/complete-read"
import { descendantFolderIds, folderBelongsToUser } from "@/lib/report-folder-scope"

export class InvalidReportFolderError extends Error {
  constructor() {
    super("The requested folder does not belong to this account")
    this.name = "InvalidReportFolderError"
  }
}

export async function resolveReportFolderScope(userId: string, targetFolder?: string | null) {
  if (!targetFolder) return null

  const folders = await readComplete((from, to) => supabaseAdmin
    .from("folders")
    .select("id, parent_id", { count: "exact" })
    .eq("user_id", userId)
    .order("id").range(from, to))
  if (!folderBelongsToUser(folders, targetFolder)) {
    throw new InvalidReportFolderError()
  }

  return { folderIds: descendantFolderIds(folders, targetFolder) }
}

export async function getReportFileIds(userId: string, documentTypes: string[], targetFolder?: string | null) {
  const scope = await resolveReportFolderScope(userId, targetFolder)
  let query = supabaseAdmin
    .from("files")
    .select("id", { count: "exact" })
    .eq("user_id", userId)
    .order("id")

  if (documentTypes.length > 0) query = query.in("document_type", documentTypes)
  if (scope) query = query.in("folder_id", scope.folderIds)

  const data = await readComplete((from, to) => query.range(from, to))
  return data.map((row) => row.id)
}
