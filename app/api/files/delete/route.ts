import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { serverError } from "@/lib/api-error"
import { validateBulkFileIds } from "@/lib/file-lifecycle"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const body = await req.json()
    const validated = validateBulkFileIds(body?.file_ids)
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 })
    const ids = validated.ids
    const { data: files, error: lookupError } = await admin.from("files").select("id, user_id, storage_path").in("id", ids)
    if (lookupError) throw new Error(`lookup_files: ${lookupError.message}`)
    if (!files || files.length !== ids.length || files.some((file) => file.user_id !== user.id)) return NextResponse.json({ error: "One or more files not found" }, { status: 404 })
    const { error: deleteError } = await admin.from("files").delete().eq("user_id", user.id).in("id", ids)
    if (deleteError) throw new Error(`delete_file_rows: ${deleteError.message}`)
    const paths = files.map((file) => file.storage_path).filter(Boolean)
    let storageRemoved = true
    if (paths.length) {
      const { error } = await admin.storage.from("documents").remove(paths)
      storageRemoved = !error
      if (error) console.error("bulk file storage cleanup failed:", { stage: "delete_storage_objects", user_id: user.id, file_ids: ids, storage_paths: paths, message: error.message })
    }
    for (const [table, stage] of [["context_summaries", "delete_context_summaries"], ["user_analytics_profile", "delete_user_analytics_profile"]] as const) {
      const { error } = await admin.from(table).delete().eq("user_id", user.id)
      if (error) console.error("bulk file derived cleanup failed:", { stage, user_id: user.id, message: error.message })
    }
    return NextResponse.json({ success: true, summaries_stale: true, results: ids.map((file_id: string) => ({ file_id, deleted: true, storage_removed: storageRemoved })) })
  } catch (err) {
    return serverError(err, { route: "files-delete", stage: "unhandled" })
  }
}
