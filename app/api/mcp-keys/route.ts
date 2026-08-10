import { NextRequest, NextResponse } from "next/server"
import { MCP_CONNECTOR_ENABLED } from "@/lib/mcp-config"
import { createApiKey, entitlementForUser, resolveJwtUser, supabaseAdmin, type KeyExpiry } from "@/lib/mcp-auth"

function disabled() { return NextResponse.json({ error: "Not found" }, { status: 404 }) }

export async function GET(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return disabled()
  const user = await resolveJwtUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data, error } = await supabaseAdmin.from("api_keys").select("id, prefix, name, scopes, created_at, last_used_at, revoked_at, expires_at").eq("user_id", user.id).order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ keys: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return disabled()
  const user = await resolveJwtUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: { action?: string; id?: string; name?: string; expiresIn?: KeyExpiry } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
  const entitlement = await entitlementForUser(user.id)
  if (entitlement.tier !== "pro" && entitlement.tier !== "business") {
    return NextResponse.json({ error: `The Claude connector is a Pro feature — upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}.`, code: "MCP_REQUIRES_PRO" }, { status: 403 })
  }
  if (body.action === "rotate") {
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 })
    const { data: current } = await supabaseAdmin.from("api_keys").select("name").eq("id", body.id).eq("user_id", user.id).maybeSingle()
    if (!current) return NextResponse.json({ error: "Key not found" }, { status: 404 })
    const { error: revokeError } = await supabaseAdmin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", body.id).eq("user_id", user.id)
    if (revokeError) return NextResponse.json({ error: revokeError.message }, { status: 500 })
    body.name = current.name
  }
  const name = String(body.name ?? "Claude").trim().slice(0, 80)
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 })
  const expiresIn = ["30d", "90d", "1y", "never"].includes(body.expiresIn ?? "") ? body.expiresIn as KeyExpiry : "1y"
  const generated = createApiKey(expiresIn)
  const { data, error } = await supabaseAdmin.from("api_keys").insert({ user_id: user.id, key_hash: generated.keyHash, prefix: generated.prefix, name, expires_at: generated.expiresAt }).select("id, prefix, name, scopes, created_at, expires_at").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ key: data, secret: generated.secret }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return disabled()
  const user = await resolveJwtUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: { id?: string } = {}
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }) }
  const id = body.id
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  const { error } = await supabaseAdmin.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return disabled()
  const user = await resolveJwtUser(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })
  const { error } = await supabaseAdmin.from("api_keys").delete().eq("id", id).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
