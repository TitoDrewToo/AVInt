import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 })

    // Verify the requesting user matches the user_id (via their JWT)
    const authHeader = req.headers.get("authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user || user.id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Delete user data in dependency order (children before parents)
    // 1. Get all file IDs for this user first
    const { data: userFiles } = await supabaseAdmin
      .from("files").select("id").eq("user_id", user_id)
    const fileIds = (userFiles ?? []).map((f: any) => f.id)

    // 2. Delete document_fields rows (reference files)
    if (fileIds.length) {
      await supabaseAdmin.from("document_fields").delete().in("file_id", fileIds)
    }

    // 3. Delete processing_jobs rows (reference files)
    if (fileIds.length) {
      await supabaseAdmin.from("processing_jobs").delete().in("file_id", fileIds)
    }

    // 4. Delete storage objects under ${user_id}/ (canonical, _inbox/, _quarantine/)
    //    Must happen before deleting the files table rows so we can still look up paths.
    const storagePaths = (await supabaseAdmin
      .from("files").select("storage_path").eq("user_id", user_id)).data?.map((f: any) => f.storage_path).filter(Boolean) ?? []
    if (storagePaths.length) {
      // Chunk removes — Supabase limits bulk remove to a few hundred per call.
      const CHUNK = 100
      for (let i = 0; i < storagePaths.length; i += CHUNK) {
        await supabaseAdmin.storage.from("documents").remove(storagePaths.slice(i, i + CHUNK))
      }
    }
    // Sweep: also list any remaining objects under the prefix (covers orphans from
    // failed uploads, legacy rows, or rows that never made it into files).
    try {
      const { data: remaining } = await supabaseAdmin.storage.from("documents").list(user_id, { limit: 1000 })
      if (remaining?.length) {
        await supabaseAdmin.storage.from("documents").remove(remaining.map((o: any) => `${user_id}/${o.name}`))
      }
      for (const sub of ["_inbox", "_quarantine"]) {
        const { data: subList } = await supabaseAdmin.storage.from("documents").list(`${user_id}/${sub}`, { limit: 1000 })
        if (subList?.length) {
          await supabaseAdmin.storage.from("documents").remove(subList.map((o: any) => `${user_id}/${sub}/${o.name}`))
        }
      }
    } catch (e) {
      console.error("storage sweep failed (non-fatal):", e)
    }

    // 5. Delete files rows
    await supabaseAdmin.from("files").delete().eq("user_id", user_id)

    // 6. Delete other user-owned tables
    await supabaseAdmin.from("advanced_widgets").delete().eq("user_id", user_id)
    await supabaseAdmin.from("dashboard_layouts").delete().eq("user_id", user_id)
    await supabaseAdmin.from("context_summaries").delete().eq("user_id", user_id)
    await supabaseAdmin.from("subscriptions").delete().eq("user_id", user_id)

    // 7. Finally delete the auth user
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
