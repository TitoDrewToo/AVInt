import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { serverError } from "@/lib/api-error"

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function clearDerivedViews(userId: string) {
  for (const [table, stage] of [["context_summaries", "delete_context_summaries"], ["user_analytics_profile", "delete_user_analytics_profile"]] as const) {
    const { error } = await admin.from(table).delete().eq("user_id", userId)
    if (error) console.error("delete-file derived cleanup failed:", { stage, user_id: userId, message: error.message })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { file_id: fileId } = await req.json()
    if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: file, error: lookupError } = await admin.from("files").select("id, user_id, storage_path").eq("id", fileId).maybeSingle()
    if (lookupError || !file || file.user_id !== user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
    const { error: deleteError } = await admin.from("files").delete().eq("id", fileId).eq("user_id", user.id)
    if (deleteError) throw new Error(`delete_file_row: ${deleteError.message}`)
    let storageRemoved = true
    if (file.storage_path) {
      const { error } = await admin.storage.from("documents").remove([file.storage_path])
      storageRemoved = !error
      if (error) console.error("delete-file storage cleanup failed:", { stage: "delete_storage_object", user_id: user.id, file_id: fileId, storage_path: file.storage_path, message: error.message })
    }
    await clearDerivedViews(user.id)
    return NextResponse.json({ success: true, summaries_stale: true, results: [{ file_id: fileId, deleted: true, storage_removed: storageRemoved }] })
  } catch (err) {
    return serverError(err, { route: "delete-file", stage: "unhandled" })
  }
}
