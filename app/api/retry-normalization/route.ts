import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"

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
    if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

    const { data: file, error: fileError } = await supabaseAdmin
      .from("files")
      .select("id, user_id, upload_status")
      .eq("id", fileId)
      .maybeSingle()
    if (fileError) throw new Error(fileError.message)
    if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
    if (file.upload_status === "quarantined") return NextResponse.json({ error: "Quarantined files cannot be retried here" }, { status: 409 })

    const { data: extraction, error: extractionError } = await supabaseAdmin
      .from("extractions")
      .select("id, status, attempt_number")
      .eq("file_id", fileId)
      .order("attempt_number", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (extractionError) throw new Error(extractionError.message)

    const { count: recordCount, error: recordsError } = await supabaseAdmin
      .from("records")
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileId)
      .is("excluded_at", null)
    if (recordsError) throw new Error(recordsError.message)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Normalization retry is not configured")

    // A missing or failed extraction needs extraction recovery first. Failure
    // and completeness belong to extractions; records only hold derived facts.
    if (!extraction || extraction.status === "failed") {
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
      return NextResponse.json({ retried: 0, failed: 0, message: "No failed extraction requires retry." })
    }

    // A classified file with no derived rows needs extraction recovery first.
    // It already passed prescan, so resetting a failed processing attempt to
    // approved keeps the existing process-document gate intact.
    if (recordCount === 0) {
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

    return NextResponse.json({ retried: 0, failed: 0, message: "No failed extraction requires retry." })
  } catch (error) {
    return serverError(error, { route: "retry-normalization", stage: "unhandled" })
  }
}
