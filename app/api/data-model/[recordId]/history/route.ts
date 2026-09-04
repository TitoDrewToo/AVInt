import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { serverError } from "@/lib/api-error"

export async function GET(request: NextRequest, { params }: { params: Promise<{ recordId: string }> }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { recordId } = await params
  const { data: record, error: recordError } = await supabaseAdmin
    .from("records")
    .select("id")
    .eq("id", recordId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (recordError) return serverError(recordError, { route: "data-model/[recordId]/history", stage: "record", userId: auth.user.id })
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 })
  const { data, error } = await supabaseAdmin
    .from("record_revisions")
    .select("id, revision_number, change_kind, target_kind, target, previous_value, new_value, actor, note, created_at")
    .eq("record_id", recordId)
    .eq("user_id", auth.user.id)
    .order("revision_number", { ascending: false })
  if (error) return serverError(error, { route: "data-model/[recordId]/history", stage: "history", userId: auth.user.id })
  return NextResponse.json({ revisions: data ?? [] })
}
