import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_ROWS_PER_REQUEST = 50

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!(await checkRateLimit("normalization-retry", auth.user.id, 60, 10))) {
      return NextResponse.json({ error: "Too many retry requests" }, { status: 429 })
    }

    const body = await req.json()
    const fileId = typeof body.file_id === "string" ? body.file_id : ""
    const requestedRowIds = Array.isArray(body.row_ids)
      ? body.row_ids.filter((value: unknown): value is string => typeof value === "string").slice(0, MAX_ROWS_PER_REQUEST)
      : []
    if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

    const { data: file, error: fileError } = await supabaseAdmin
      .from("files")
      .select("id, user_id, upload_status")
      .eq("id", fileId)
      .maybeSingle()
    if (fileError) throw new Error(fileError.message)
    if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
    if (file.upload_status === "quarantined") return NextResponse.json({ error: "Quarantined files cannot be retried here" }, { status: 409 })

    let query = supabaseAdmin
      .from("document_fields")
      .select("*")
      .eq("file_id", fileId)
      .eq("normalization_status", "failed")
      .order("created_at", { ascending: true })
      .limit(MAX_ROWS_PER_REQUEST)
    if (requestedRowIds.length > 0) query = query.in("id", requestedRowIds)

    const { data: rows, error: rowsError } = await query
    if (rowsError) throw new Error(rowsError.message)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Normalization retry is not configured")

    // A classified file with no extracted rows needs extraction recovery first.
    // It already passed prescan, so resetting a failed processing attempt to
    // approved keeps the existing process-document gate intact.
    if (!rows?.length) {
      if (["approved", "uploaded", "processing"].includes(file.upload_status)) {
        if (file.upload_status === "processing") {
          const { error: resetError } = await supabaseAdmin
            .from("files")
            .update({ upload_status: "approved" })
            .eq("id", fileId)
            .eq("user_id", auth.user.id)
          if (resetError) throw new Error(resetError.message)
        }
        const response = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
          body: JSON.stringify({ file_id: fileId }),
        })
        if (!response.ok) return NextResponse.json({ error: "Extraction retry could not start" }, { status: 502 })
        return NextResponse.json({ retried: 0, failed: 0, extractionStarted: true })
      }
      return NextResponse.json({ retried: 0, failed: 0, message: "No failed normalization rows require retry." })
    }

    const results = await Promise.all(rows.map(async (row) => {
      const response = await fetch(`${supabaseUrl}/functions/v1/normalize-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
        body: JSON.stringify({ file_id: fileId, fields: row }),
      })
      return response.ok
    }))

    const retried = results.filter(Boolean).length
    const failed = results.length - retried
    if (failed > 0 && retried === 0) {
      return NextResponse.json({ error: "Normalization retry could not start", retried, failed }, { status: 502 })
    }
    return NextResponse.json({ retried, failed })
  } catch (error) {
    return serverError(error, { route: "retry-normalization", stage: "unhandled" })
  }
}
