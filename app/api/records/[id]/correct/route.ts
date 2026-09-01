import { NextRequest, NextResponse } from "next/server"
import { serverError } from "@/lib/api-error"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { applyOverrides } from "@/supabase/functions/_shared/apply-overrides"
import { coerceAttributeValue, coerceCorrectionValue, isValidAttributeKey, normalizeCorrectionKey, RECORD_FIELD_SET, type CorrectionAttributeType } from "@/lib/correction-contract"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { id } = await params
    const { data: record, error: recordError } = await supabaseAdmin.from("records").select("*").eq("id", id).maybeSingle()
    if (recordError) throw new Error(recordError.message)
    if (!record || record.user_id !== auth.user.id) return NextResponse.json({ error: "Record not found" }, { status: 404 })

    const body = await req.json().catch(() => null)
    const targetKind = body?.target_kind
    const rawTarget = typeof body?.target === "string" ? body.target.trim() : ""
    if (targetKind !== "column" && targetKind !== "attribute") return NextResponse.json({ error: "target_kind must be column or attribute" }, { status: 400 })
    const target = targetKind === "attribute" ? normalizeCorrectionKey(rawTarget) : rawTarget
    if (targetKind === "column" ? !RECORD_FIELD_SET.has(target) : !isValidAttributeKey(rawTarget)) return NextResponse.json({ error: "Invalid correction target" }, { status: 400 })

    let newValue: unknown
    try {
      if (targetKind === "attribute") {
        if (body?.value_type !== "text" && body?.value_type !== "number" && body?.value_type !== "date") return NextResponse.json({ error: "value_type must be text, number, or date for attributes" }, { status: 400 })
        newValue = coerceAttributeValue(body.value_type as CorrectionAttributeType, body?.new_value)
      } else {
        newValue = coerceCorrectionValue(target, body?.new_value)
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid correction value" }, { status: 400 })
    }
    let previousValue: unknown = targetKind === "column" ? record[target] : null
    if (targetKind === "attribute") {
      const { data: attribute, error: attributeError } = await supabaseAdmin.from("record_attributes").select("value").eq("record_id", id).eq("field_key", target).maybeSingle()
      if (attributeError) throw new Error(attributeError.message)
      previousValue = attribute?.value ?? null
    }
    const { error: revisionError } = await supabaseAdmin.rpc("insert_record_revision", {
      p_record_id: id,
      p_change_kind: "user_edit",
      p_target_kind: targetKind,
      p_target: target,
      p_previous_value: previousValue,
      p_new_value: newValue,
      p_actor: auth.user.id,
      p_note: typeof body?.note === "string" ? body.note : null,
    })
    if (revisionError) throw new Error(`record revision insert failed: ${revisionError.message}`)
    const { error: reviewError } = await supabaseAdmin.from("records").update({ needs_review: false }).eq("id", id)
    if (reviewError) throw new Error(`record review status update failed: ${reviewError.message}`)
    await applyOverrides(supabaseAdmin, [id])
    const { data: updated, error: updatedError } = await supabaseAdmin.from("records").select("*").eq("id", id).single()
    if (updatedError) throw new Error(updatedError.message)
    return NextResponse.json({ record: updated })
  } catch (error) {
    return serverError(error, { route: "records-correct", stage: "unhandled" })
  }
}
