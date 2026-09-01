import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { syncVirtualRecord } from "@/lib/virtual-records"
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

  const [{ data: file, error: fileError }, { data: row, error: rowError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, user_id, document_type, file_type").eq("id", fileId).maybeSingle(),
    supabaseAdmin.from("document_fields").select("*").eq("file_id", fileId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (fileError || rowError) return NextResponse.json({ error: fileError?.message ?? rowError?.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
  if (!row) return NextResponse.json({ error: "Document fields not found" }, { status: 404 })

  try {
    if (file.file_type === "manual") {
      const documentType = file.document_type || "general_document"
      const customResult = customFieldsPayload(customFields, row.currency ?? "USD")
      if (customResult.issues.length > 0) throw new Error(customResult.issues[0].message)
      const payload = {
        document_type: documentType,
        vendor_name: row.vendor_name ?? row.counterparty_name ?? null,
        employer_name: row.employer_name ?? null,
        document_date: row.document_date ?? null,
        currency: row.currency ?? null,
        total_amount: row.total_amount ?? null,
        gross_income: row.gross_income ?? null,
        net_income: row.net_income ?? null,
        expense_category: row.expense_category ?? null,
        tax_amount: row.tax_amount ?? null,
        invoice_number: row.invoice_number ?? null,
        period_start: row.period_start ?? null,
        period_end: row.period_end ?? null,
        description: documentType === "general_document" ? row.notes ?? null : null,
        notes: row.notes ?? null,
        confidence: 1,
        ...customResult.payload,
      }
      const extractionId = await writeExtraction(supabaseAdmin, {
        userId: auth.user.id,
        fileId,
        documentType,
        provider: "manual",
        model: null,
        payload,
        sourceRowCount: 1,
        attemptNumber: 1,
      })
      const derived = deriveRecords(payload, { id: fileId, user_id: auth.user.id }, { sourceKey: "root" })
      if (derived.reason) throw new Error(`manual record derivation failed: ${derived.reason}`)
      await persistDerived(supabaseAdmin, extractionId, derived)
    }
    await syncVirtualRecord(supabaseAdmin, row, file)
    return NextResponse.json({ synced: true, file_id: fileId, source_record_id: row.id })
  } catch (error) {
    console.error("virtual record sync failed", { fileId, userId: auth.user.id, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Virtual record sync failed" }, { status: 500 })
  }
}
