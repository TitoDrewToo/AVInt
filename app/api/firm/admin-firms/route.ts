import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  const { data: admins, error: adminsError } = await supabaseAdmin
    .from("firm_admins")
    .select("firm_id")
    .eq("user_id", auth.user.id)
  if (adminsError) return NextResponse.json({ error: "Could not load firm access" }, { status: 500 })

  const firmIds = (admins ?? []).map((row) => row.firm_id)
  if (firmIds.length === 0) return NextResponse.json({ firms: [] })
  const { data: firms, error: firmsError } = await supabaseAdmin
    .from("firms")
    .select("id, name, slug, status")
    .in("id", firmIds)
    .order("name")
  if (firmsError) return NextResponse.json({ error: "Could not load firm access" }, { status: 500 })
  return NextResponse.json({ firms: (firms ?? []).filter((firm) => firm.status === "active") }, { headers: { "Cache-Control": "no-store" } })
}
