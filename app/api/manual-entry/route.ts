import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { customFieldsPayload, parseManualNumber, type CustomFieldInput } from "@/lib/document-type-fields"
import { deriveRecords } from "@/supabase/functions/_shared/derive-records"
import { persistDerived } from "@/supabase/functions/_shared/persist-derived"
import { writeExtraction } from "@/supabase/functions/_shared/write-extraction"

const NUMERIC_FIELDS = ["total_amount", "gross_income", "net_income", "tax_amount", "discount_amount"] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const fields = isRecord(body?.fields) ? body.fields : null
  if (!fields || typeof fields.document_type !== "string" || typeof fields.filename !== "string") {
    return NextResponse.json({ error: "document_type, filename, and typed fields are required" }, { status: 400 })
  }
  const customFields = Array.isArray(body?.custom_fields) ? body.custom_fields : []
  if (!customFields.every((field: unknown): field is CustomFieldInput => isRecord(field)
    && typeof field.id === "string" && typeof field.label === "string"
    && (field.type === "text" || field.type === "number" || field.type === "date")
    && typeof field.value === "string")) {
    return NextResponse.json({ error: "Invalid custom field" }, { status: 400 })
  }

  const currency = typeof fields.currency === "string" ? fields.currency : "USD"
  const customResult = customFieldsPayload(customFields, currency)
  if (customResult.issues.length > 0) return NextResponse.json({ error: customResult.issues[0].message }, { status: 400 })

  const payload: Record<string, unknown> = {
    ...fields,
    vendor_name: fields.vendor_name ?? fields.counterparty ?? null,
    ...customResult.payload,
  }
  for (const field of NUMERIC_FIELDS) {
    const value = payload[field]
    if (value === null || value === undefined || value === "") payload[field] = null
    else if (typeof value !== "number") {
      const parsed = parseManualNumber(String(value), currency)
      if (parsed.error) return NextResponse.json({ error: `${field}: ${parsed.error}` }, { status: 400 })
      payload[field] = parsed.value
    }
  }

  let fileId: string | null = null
  try {
    const { data: file, error: fileError } = await supabaseAdmin
      .from("files")
      .insert({
        user_id: auth.user.id,
        filename: fields.filename,
        file_type: "manual",
        file_size: 0,
        document_type: fields.document_type,
        storage_path: "",
        folder_id: null,
        upload_status: "processing",
        normalization_expected: 0,
        normalization_settled: 0,
      })
      .select("id, filename, file_type, file_size, document_type, created_at, storage_path, folder_id")
      .single()
    if (fileError || !file) throw new Error(fileError?.message ?? "Failed to create file record.")
    fileId = file.id

    const createdFileId = file.id
    const extractionId = await writeExtraction(supabaseAdmin, {
      userId: auth.user.id,
      fileId: createdFileId,
      documentType: fields.document_type,
      provider: "manual",
      model: null,
      payload,
      sourceRowCount: 1,
      attemptNumber: 1,
    })
    const derived = deriveRecords(payload, { id: createdFileId, user_id: auth.user.id }, { sourceKey: "root" })
    if (derived.reason) throw new Error(`record derivation failed: ${derived.reason}`)
    await persistDerived(supabaseAdmin, extractionId, derived)
    const { data: completed, error: statusError } = await supabaseAdmin
      .from("files")
      .update({ upload_status: "done" })
      .eq("id", createdFileId)
      .select("id, filename, file_type, file_size, document_type, created_at, storage_path, folder_id")
      .single()
    if (statusError || !completed) throw new Error(statusError?.message ?? "Failed to mark manual entry complete.")
    return NextResponse.json({ file: completed })
  } catch (error) {
    if (fileId) await supabaseAdmin.from("files").delete().eq("id", fileId)
    console.error("manual entry failed", { userId: auth.user.id, fileId, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Manual entry failed." }, { status: 500 })
  }
}
