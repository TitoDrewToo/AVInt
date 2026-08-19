import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { checkRateLimit } from "@/lib/rate-limit"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)
const cleanupSchema = z.object({
  storagePath: z.string().min(1).max(500),
  fileId: z.string().uuid().nullable().optional(),
})

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await checkRateLimit("upload-cleanup", user.id, 60, 30))) {
    return NextResponse.json({ error: "Too many cleanup requests" }, { status: 429 })
  }

  const parsed = cleanupSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid cleanup request" }, { status: 400 })
  const { storagePath, fileId = null } = parsed.data
  const inboxPrefix = `${user.id}/_inbox/`
  if (!storagePath.startsWith(inboxPrefix) || storagePath.includes("..")) {
    return NextResponse.json({ error: "Only this account's inbox objects can be cleaned up" }, { status: 400 })
  }

  if (fileId) {
    const { data: file, error: fileLookupError } = await supabaseAdmin
      .from("files")
      .select("id, storage_path")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (fileLookupError) return NextResponse.json({ error: fileLookupError.message }, { status: 500 })
    if (file && file.storage_path !== storagePath) {
      return NextResponse.json({ error: "File path does not match the requested cleanup" }, { status: 400 })
    }
    if (file) {
      const { error: deleteJobError } = await supabaseAdmin.from("processing_jobs").delete().eq("file_id", file.id)
      if (deleteJobError) return NextResponse.json({ error: deleteJobError.message }, { status: 500 })
      const { error: deleteFileError } = await supabaseAdmin.from("files").delete().eq("id", file.id)
      if (deleteFileError) return NextResponse.json({ error: deleteFileError.message }, { status: 500 })
    }
  }

  const { error: removeError } = await supabaseAdmin.storage.from("documents").remove([storagePath])
  if (removeError) return NextResponse.json({ error: removeError.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
