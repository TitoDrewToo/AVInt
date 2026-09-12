import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin, entitlementForUser } from "@/lib/mcp-auth"
import { ingestFileBatch } from "@/lib/mcp-ingest-batch"
import { recordCollaborationAudit, resolveCollaborationAccess } from "@/lib/collaboration-access"
import { boundedFormData, UploadBodyTooLargeError } from "@/lib/bounded-form-data"

function bearer(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null
}

/** Multipart delegated submission; files follow the normal ingestion lifecycle. */
export async function POST(request: Request) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const token = bearer(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: rateAllowed, error: rateError } = await supabaseAdmin.rpc("rate_limit_hit", { p_bucket: "mcp-ingest", p_key: auth.user.id, p_window_seconds: 60, p_max_calls: 10 })
  if (rateError) return NextResponse.json({ error: "Submission temporarily unavailable" }, { status: 503 })
  if (rateAllowed !== true) return NextResponse.json({ error: "Too many submissions" }, { status: 429 })

  let form: FormData
  try {
    // Six 15 MiB files plus 1 MiB of multipart fields/headers. The stream limit
    // is enforced even when Content-Length is missing or falsely small.
    form = await boundedFormData(request, 91 * 1024 * 1024)
  } catch (error) {
    return NextResponse.json({ error: error instanceof UploadBodyTooLargeError ? "Total upload size exceeds the limit" : "Invalid multipart upload" }, { status: error instanceof UploadBodyTooLargeError ? 413 : 400 })
  }
  const idempotencyKey = form?.get("idempotency_key")
  if (typeof idempotencyKey !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) return NextResponse.json({ error: "A UUID idempotency_key is required" }, { status: 400 })
  const workflowId = form?.get("workflow_id")
  if (typeof workflowId !== "string" || !workflowId) return NextResponse.json({ error: "workflow_id is required" }, { status: 400 })
  const destinationFolderId = form?.get("destination_folder_id")
  if (typeof destinationFolderId !== "string" || !destinationFolderId) return NextResponse.json({ error: "destination_folder_id is required" }, { status: 400 })
  const access = await resolveCollaborationAccess({ actorUserId: auth.user.id, workflowId, action: "submit", destinationFolderId })
  if (!access.workflow || !access.decision.allowed || access.decision.owner.kind !== "personal") {
    if (access.workflow) await recordCollaborationAudit({ actorUserId: auth.user.id, workflow: access.workflow, action: "submit", outcome: "denied", decision: access.decision })
    return NextResponse.json({ error: "This workflow does not allow delegated submission." }, { status: 403 })
  }
  if (!access.workflow.intake_folder_id) return NextResponse.json({ error: "This workflow has no intake folder." }, { status: 409 })

  const files = form?.getAll("files").filter((value): value is File => value instanceof File) ?? []
  if (!files.length || files.length > 6) return NextResponse.json({ error: "Provide between 1 and 6 files." }, { status: 400 })
  if (files.some(file => file.size > 15 * 1024 * 1024)) return NextResponse.json({ error: "Each file must be at most 15 MB" }, { status: 413 })
  try {
    const inputs = await Promise.all(files.map(async (file) => ({ name: file.name, mimeType: file.type || "application/octet-stream", data: `data:${file.type || "application/octet-stream"};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}` })))
    const result = await ingestFileBatch(access.decision.owner.userId, await entitlementForUser(access.decision.owner.userId), idempotencyKey, inputs, { actorUserId: auth.user.id, workflowId, folderId: access.workflow.intake_folder_id })
    await recordCollaborationAudit({ actorUserId: auth.user.id, workflow: access.workflow, action: "submit", outcome: "completed", decision: access.decision, metadata: { batch_id: result.batch_id, file_ids: result.items.map(item => item.file_id).filter(Boolean) } })
    return NextResponse.json({ workflow_id: workflowId, ...result }, { status: 202 })
  } catch (error) {
    await recordCollaborationAudit({ actorUserId: auth.user.id, workflow: access.workflow, action: "submit", outcome: "failed", decision: access.decision })
    console.error("[collaboration/submit] failed", { actorUserId: auth.user.id, workflowId, error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "The delegated submission could not be processed." }, { status: 500 })
  }
}
