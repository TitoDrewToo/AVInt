import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

function bearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
}

export async function POST(request: NextRequest, context: { params: Promise<{ recordId: string }> }) {
  const token = bearerToken(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { recordId } = await context.params
  const body = await request.json().catch(() => null)
  const versionId = typeof body?.version_id === "string" ? body.version_id : ""
  if (!recordId || !versionId) return NextResponse.json({ error: "recordId and version_id are required" }, { status: 400 })

  const { data, error } = await supabaseAdmin.rpc("rollback_virtual_record", {
    p_user_id: auth.user.id,
    p_record_id: recordId,
    p_version_id: versionId,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, ...data })
}
