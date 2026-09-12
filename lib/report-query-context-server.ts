import { supabaseAdmin } from "@/lib/mcp-auth"
import { readComplete } from "@/lib/complete-read"
import { resolveReportFolderScope } from "@/lib/report-folder-scope-server"

export type ReportQueryContext = {
  userId: string
  dateFrom: string
  dateTo: string
  targetFolder: string
  fileIds: (documentTypes?: string[]) => Promise<string[]>
}

/** Shared ownership/date/folder context for all report branches in one request. */
export async function createReportQueryContext(
  userId: string,
  filters: { dateFrom?: string; dateTo?: string; targetFolder?: string | null },
): Promise<ReportQueryContext> {
  const targetFolder = filters.targetFolder ?? ""
  const scope = await resolveReportFolderScope(userId, targetFolder)
  const scopedFolderIds = scope?.folderIds ?? null

  return {
    userId,
    dateFrom: filters.dateFrom ?? "",
    dateTo: filters.dateTo ?? "",
    targetFolder,
    fileIds: async (documentTypes = []) => {
      let query = supabaseAdmin.from("files").select("id", { count: "exact" }).eq("user_id", userId).order("id")
      if (documentTypes.length > 0) query = query.in("document_type", documentTypes)
      if (scopedFolderIds) query = query.in("folder_id", scopedFolderIds)
      const data = await readComplete((from, to) => query.range(from, to))
      return data.map((row) => row.id)
    },
  }
}
