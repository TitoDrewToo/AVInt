import { createHash, randomBytes } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"

import { MCP_CONNECTOR_ENABLED } from "@/lib/mcp-config"
import { computeEntitlement, type Entitlement } from "@/lib/entitlement"

export type KeyExpiry = "30d" | "90d" | "1y" | "never"

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function bearerValue(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

export async function resolveApiKey(req: Request | NextRequest): Promise<{ userId: string } | null> {
  if (!MCP_CONNECTOR_ENABLED) return null
  const plaintext = bearerValue(req.headers.get("authorization"))
  if (!plaintext || plaintext.length < 20) return null
  const keyHash = createHash("sha256").update(plaintext, "utf8").digest("hex")
  const { data: key, error } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, scopes, expires_at")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle()
  if (error || !key || !Array.isArray(key.scopes) || !key.scopes.includes("smart_storage")) return null
  if (key.expires_at && new Date(key.expires_at).getTime() <= Date.now()) return null
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id)
  return { userId: key.user_id }
}

export async function resolveJwtUser(req: Request) {
  const token = bearerValue(req.headers.get("authorization"))
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  return error || !user ? null : user
}

export function expiryDateFor(choice: KeyExpiry = "1y", now = new Date()) {
  if (choice === "never") return null
  const days = choice === "30d" ? 30 : choice === "90d" ? 90 : 365
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
}

export function createApiKey(expiresIn: KeyExpiry = "1y") {
  const secret = `avint_${randomBytes(32).toString("base64url")}`
  return { secret, prefix: secret.slice(0, 8), keyHash: createHash("sha256").update(secret, "utf8").digest("hex"), expiresAt: expiryDateFor(expiresIn) }
}

export async function entitlementForUser(userId: string): Promise<Entitlement> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("status, plan, current_period_end").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  return computeEntitlement(data)
}

export function isApiKeyClient(client: SupabaseClient) {
  return client === supabaseAdmin
}
