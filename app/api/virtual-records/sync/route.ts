import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { customFieldsPayload, type CustomFieldInput } from "@/lib/document-type-fields"
import { deriveRecords } from "@/supabase/functions/_shared/derive-records"
import { persistDerived } from "@/supabase/functions/_shared/persist-derived"
import { writeExtraction } from "@/supabase/functions/_shared/write-extraction"

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const fileId = typeof body?.file_id === "string" ? body.file_id : ""
  const customFields = Array.isArray(body?.custom_fields) ? body.custom_fields.filter((field: unknown): field is CustomFieldInput => {
    if (!field || typeof field !== "object") return false
    const candidate = field as Record<string, unknown>
    return typeof candidate.id === "string" && typeof candidate.label === "string" && typeof candidate.type === "string" && typeof candidate.value === "string"
  }) : []
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

  const [{ data: file, error: fileError }, { data: record, error: recordError }, { data: extraction, error: extractionError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, user_id, document_type, file_type").eq("id", fileId).maybeSingle(),
    supabaseAdmin.from("records").select("id, source_key").eq("file_id", fileId).is("parent_record_id", null).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("extractions").select("id, payload, provider, model, document_type, source_row_count, attempt_number").eq("file_id", fileId).eq("status", "succeeded").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (fileError || recordError || extractionError) return NextResponse.json({ error: fileError?.message ?? recordError?.message ?? extractionError?.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
  if (!extraction) return NextResponse.json({ error: "Extraction not found" }, { status: 404 })

  try {
    const documentType = file.document_type || extraction.document_type || "general_document"
    const basePayload = extraction.payload && typeof extraction.payload === "object" && !Array.isArray(extraction.payload)
      ? extraction.payload as Record<string, unknown>
      : extraction.payload
    const customResult = customFieldsPayload(customFields, typeof basePayload === "object" && basePayload && "currency" in basePayload && typeof basePayload.currency === "string" ? basePayload.currency : "USD")
    if (customResult.issues.length > 0) throw new Error(customResult.issues[0].message)
    const payload = Array.isArray(basePayload) || !basePayload || typeof basePayload !== "object"
      ? basePayload
      : { ...basePayload, document_type: documentType, ...customResult.payload }
    const extractionId = await writeExtraction(supabaseAdmin, {
      userId: auth.user.id,
      fileId,
      documentType,
      provider: extraction.provider,
      model: extraction.model,
      payload,
      sourceRowCount: extraction.source_row_count,
      attemptNumber: extraction.attempt_number,
    })
    const derived = deriveRecords(payload, { id: fileId, user_id: auth.user.id }, { sourceKey: "root" })
    if (derived.reason) throw new Error(`record derivation failed: ${derived.reason}`)
    await persistDerived(supabaseAdmin, extractionId, derived)
    return NextResponse.json({ synced: true, file_id: fileId, source_record_id: record?.id ?? null })
  } catch (error) {
    console.error("virtual record sync failed", { fileId, userId: auth.user.id, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Virtual record sync failed" }, { status: 500 })
  }
}
