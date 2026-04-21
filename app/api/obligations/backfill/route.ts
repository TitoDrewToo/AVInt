import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  // Auth
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // 1. Get all contract/agreement files for this user
  const { data: userFiles, error: filesErr } = await supabaseAdmin
    .from("files")
    .select("id, document_type")
    .eq("user_id", user.id)
    .in("document_type", ["contract", "agreement"])

  if (filesErr) return serverError(filesErr, { route: "obligations/backfill", stage: "list_files", userId: user.id })
  if (!userFiles?.length) return NextResponse.json({ created: 0 })

  const fileIds = userFiles.map((f: any) => f.id)

  // 2. Fetch document_fields rows with non-null line_items for those files
  const { data: fieldRows, error: dfErr } = await supabaseAdmin
    .from("document_fields")
    .select("file_id, line_items, counterparty_name, currency")
    .in("file_id", fileIds)
    .not("line_items", "is", null)

  if (dfErr) return serverError(dfErr, { route: "obligations/backfill", stage: "list_fields", userId: user.id })

  // 3. Fetch existing obligations to avoid duplicates
  const { data: existing } = await supabaseAdmin
    .from("payment_obligations")
    .select("file_id, due_date, check_number")
    .eq("user_id", user.id)

  const existingKeys = new Set(
    (existing ?? []).map((r: any) => `${r.file_id}|${r.due_date}|${r.check_number ?? ""}`)
  )

  // 4. Build insert rows — only line_items that have a due_date
  const toInsert: any[] = []
  for (const row of fieldRows ?? []) {
    const items = Array.isArray(row.line_items) ? row.line_items : []
    for (const item of items) {
      if (!item?.due_date) continue
      const key = `${row.file_id}|${item.due_date}|${item.check_number ?? ""}`
      if (existingKeys.has(key)) continue
      toInsert.push({
        user_id:           user.id,
        file_id:           row.file_id,
        counterparty_name: row.counterparty_name ?? null,
        description:       item.description ?? null,
        amount:            typeof item.amount === "number" ? item.amount : null,
        currency:          row.currency ?? "PHP",
        due_date:          item.due_date,
        check_number:      item.check_number ?? null,
        bank_name:         item.bank_name ?? null,
        status:            "pending",
      })
      existingKeys.add(key)
    }
  }

  if (!toInsert.length) return NextResponse.json({ created: 0 })

  const { error: insertErr } = await supabaseAdmin
    .from("payment_obligations")
    .insert(toInsert)

  if (insertErr) return serverError(insertErr, { route: "obligations/backfill", stage: "insert", userId: user.id })

  return NextResponse.json({ created: toInsert.length })
}
