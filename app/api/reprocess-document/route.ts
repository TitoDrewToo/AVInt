import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"

const TERMINAL_UPLOAD_STATUSES = ["done", "normalized"]

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit("normalization-retry", auth.user.id, 60, 5))) {
    return NextResponse.json({ error: "Too many reprocess requests" }, { status: 429 })
  }

  const body = await request.json().catch(() => null)
  const fileId = typeof body?.file_id === "string" ? body.file_id : ""
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

  const { data: file, error: fileError } = await supabaseAdmin
    .from("files")
    .select("id, user_id, storage_path, upload_status")
    .eq("id", fileId)
    .maybeSingle()
  if (fileError) return NextResponse.json({ error: fileError.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
  if (!TERMINAL_UPLOAD_STATUSES.includes(file.upload_status ?? "")) {
    return NextResponse.json({ error: "This file is not in a terminal state and cannot be reprocessed yet." }, { status: 409 })
  }
  if (!file.storage_path) return NextResponse.json({ error: "This file has no storage object, so it cannot be re-read." }, { status: 409 })

  const { data: extraction, error: extractionError } = await supabaseAdmin
    .from("extractions")
    .select("id")
    .eq("file_id", fileId)
    .limit(1)
    .maybeSingle()
  if (extractionError) return NextResponse.json({ error: extractionError.message }, { status: 500 })
  if (!extraction) return NextResponse.json({ error: "This file has no extraction row, so it cannot be reprocessed." }, { status: 409 })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Reprocess is not configured" }, { status: 500 })
  }

  const { data: object, error: storageError } = await supabaseAdmin.storage
    .from("documents")
    .download(file.storage_path)
  if (storageError || !object) {
    return NextResponse.json({ error: "This file has no readable storage object, so it cannot be reprocessed." }, { status: 409 })
  }

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("files")
    .update({ upload_status: "processing" })
    .eq("id", fileId)
    .eq("user_id", auth.user.id)
    .in("upload_status", TERMINAL_UPLOAD_STATUSES)
    .select("id")
    .maybeSingle()
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 })
  if (!claimed) return NextResponse.json({ error: "This file is already being processed or is no longer in a terminal state." }, { status: 409 })

  const { data: job, error: jobError } = await supabaseAdmin
    .from("processing_jobs")
    .insert({ file_id: fileId, status: "uploaded" })
    .select("id")
    .single()
  if (jobError || !job) {
    await supabaseAdmin.from("files").update({ upload_status: file.upload_status }).eq("id", fileId).eq("upload_status", "processing")
    return NextResponse.json({ error: jobError?.message ?? "Could not create a reprocess job" }, { status: 500 })
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/process-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({ file_id: fileId, job_id: job.id, reprocess: true }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      return NextResponse.json({ error: detail || "Reprocess could not start" }, { status: 502 })
    }
    return NextResponse.json({ started: true, file_id: fileId, job_id: job.id })
  } catch (error) {
    console.error("reprocess invocation failed", { fileId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Reprocess could not start" }, { status: 502 })
  }
}
