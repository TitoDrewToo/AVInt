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
    .order("id").range(from, to), 100_000, "folders")
  if (!folderBelongsToUser(folders, targetFolder)) {
    throw new InvalidReportFolderError()
  }

  return { folderIds: descendantFolderIds(folders, targetFolder) }
}
