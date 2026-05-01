import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function throwIfDeleteFailed(stage: string, error: { message: string } | null) {
  if (error) throw new Error(`${stage}: ${error.message}`)
}

export async function POST(req: NextRequest) {
  try {
    const { file_id } = await req.json()
    if (!file_id) {
      return NextResponse.json({ error: "file_id required" }, { status: 400 })
    }

    const authHeader = req.headers.get("authorization")
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from("files")
      .select("id, user_id, storage_path")
      .eq("id", file_id)
      .single()

    if (fileError || !fileRow || fileRow.user_id !== user.id) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const { error: documentFieldsError } = await supabaseAdmin
      .from("document_fields")
      .delete()
      .eq("file_id", file_id)
    throwIfDeleteFailed("delete_document_fields", documentFieldsError)

    const { error: processingJobsError } = await supabaseAdmin
      .from("processing_jobs")
      .delete()
      .eq("file_id", file_id)
    throwIfDeleteFailed("delete_processing_jobs", processingJobsError)

    const { error: paymentObligationsError } = await supabaseAdmin
      .from("payment_obligations")
      .delete()
      .eq("file_id", file_id)
    throwIfDeleteFailed("delete_payment_obligations", paymentObligationsError)

    if (fileRow.storage_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("documents")
        .remove([fileRow.storage_path])
      throwIfDeleteFailed("delete_storage_object", storageError)
    }

    const { error: filesError } = await supabaseAdmin
      .from("files")
      .delete()
      .eq("id", file_id)
    throwIfDeleteFailed("delete_file_row", filesError)

    // These are user-level derived views over the document set. Clearing them
    // ensures the UI does not continue showing stale summaries after a file is removed.
    const { error: contextSummariesError } = await supabaseAdmin
      .from("context_summaries")
      .delete()
      .eq("user_id", user.id)
    if (contextSummariesError) {
      console.error("delete-file derived cleanup failed:", {
        stage: "delete_context_summaries",
        user_id: user.id,
        message: contextSummariesError.message,
      })
    }

    const { error: advancedWidgetsError } = await supabaseAdmin
      .from("advanced_widgets")
      .delete()
      .eq("user_id", user.id)
    if (advancedWidgetsError) {
      console.error("delete-file derived cleanup failed:", {
        stage: "delete_advanced_widgets",
        user_id: user.id,
        message: advancedWidgetsError.message,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return serverError(err, { route: "delete-file", stage: "unhandled" })
  }
}
