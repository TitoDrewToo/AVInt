import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { logApiError, serverError } from "@/lib/api-error"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 })

    const authHeader = req.headers.get("authorization")
    if (!authHeader) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user || user.id !== user_id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Atomic DB deletion. Returns storage_paths + per-table counts. Any SQL
    // failure inside the RPC rolls back the entire transaction — no partial
    // state on our primary database.
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      "delete_user_data",
      { p_user_id: user_id },
    )
    if (rpcErr) return serverError(rpcErr, { route: "delete-account", stage: "rpc", userId: user_id })

    const storagePaths: string[] = Array.isArray(rpcResult?.storage_paths) ? rpcResult.storage_paths : []

    // Best-effort storage cleanup. DB rows are already gone — any errors here
    // become orphaned storage objects, not user-facing failures.
    try {
      if (storagePaths.length) {
        const CHUNK = 100
        for (let i = 0; i < storagePaths.length; i += CHUNK) {
          await supabaseAdmin.storage.from("documents").remove(storagePaths.slice(i, i + CHUNK))
        }
      }
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
      logApiError(e, { route: "delete-account", stage: "storage_sweep", userId: user_id })
    }

    // Last step. If this fails the DB is already clean and anonymized — the
    // user can retry safely: the RPC is idempotent (no rows to delete, subs
    // already nulled) and auth.admin.deleteUser will re-fire.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id)
    if (error) return serverError(error, { route: "delete-account", stage: "auth_delete", userId: user_id })

    return NextResponse.json({ success: true, counts: rpcResult?.counts ?? {} })
  } catch (err) {
    return serverError(err, { route: "delete-account", stage: "unhandled" })
  }
}
