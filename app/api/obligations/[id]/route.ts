import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Auth
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Parse body
  let body: { status?: string; paid_at?: string; paid_via?: string; notes?: string }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { status, paid_at, paid_via, notes } = body

  const validStatuses = ["pending", "paid", "disputed"]
  if (status !== undefined && !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 422 })
  }

  // Update — ownership enforced by .eq("user_id", user.id)
  const update: Record<string, any> = {}
  if (status  !== undefined) update.status   = status
  if (paid_at !== undefined) update.paid_at  = paid_at || null
  if (paid_via !== undefined) update.paid_via = paid_via || null
  if (notes   !== undefined) update.notes    = notes || null

  const { data, error } = await supabaseAdmin
    .from("payment_obligations")
    .update(update)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data)  return NextResponse.json({ error: "Not found" },   { status: 404 })

  return NextResponse.json({ obligation: data })
}
