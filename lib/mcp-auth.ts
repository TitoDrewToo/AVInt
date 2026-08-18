import { createClient } from "@supabase/supabase-js"
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload } from "jose"

import { MCP_OAUTH_ENABLED, mcpResourceUrl, workosIssuer } from "@/lib/mcp-config"
import { computeEntitlement, computeFirmClientEntitlement, type Entitlement } from "@/lib/entitlement"
import { getWorkOSClient } from "@/lib/workos"

export class OAuthAccountRequiredError extends Error {
  constructor() {
    super("Connect requires a Smart Storage account with this email")
    this.name = "OAuthAccountRequiredError"
  }
}

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function bearerValue(value: string | null) {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? null
}

const oauthJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getOAuthJwks(issuer: string) {
  let jwks = oauthJwks.get(issuer)
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`))
    oauthJwks.set(issuer, jwks)
  }
  return jwks
}

async function emailFromOAuthClaims(payload: JWTPayload) {
  if (typeof payload.email === "string" && payload.email.trim()) return payload.email.trim().toLowerCase()
  if (typeof payload.sub !== "string" || !payload.sub) return null
  const workos = getWorkOSClient()
  if (!workos) return null
  const user = await workos.userManagement.getUser(payload.sub)
  return user.email?.trim().toLowerCase() || null
}

export async function resolveOAuthToken(req: Request): Promise<{ userId: string } | null> {
  if (!MCP_OAUTH_ENABLED) return null
  const token = bearerValue(req.headers.get("authorization"))
  if (!token) return null
  const issuer = workosIssuer()
  const resource = mcpResourceUrl()
  if (!issuer || !resource || !process.env.WORKOS_API_KEY || !process.env.WORKOS_CLIENT_ID) return null
  try {
    const { payload } = await jwtVerify(token, getOAuthJwks(issuer), { issuer, audience: resource })
    const email = await emailFromOAuthClaims(payload)
    if (!email) throw new OAuthAccountRequiredError()
    const { data: userId, error } = await supabaseAdmin.rpc("get_user_id_by_email", { p_email: email })
    if (error) throw new Error(error.message)
    if (!userId) throw new OAuthAccountRequiredError()
    return { userId }
  } catch (error) {
    if (error instanceof OAuthAccountRequiredError) throw error
    // Diagnostic (observability-first): surface WHY jwtVerify rejected the token.
    // Never logs the token or any secret — only claim identifiers and the jose code.
    try {
      const claims = decodeJwt(token)
      const audValue = Array.isArray(claims.aud) ? claims.aud.join(",") : claims.aud
      console.error("[mcp-oauth] token verify failed", {
        code: (error as { code?: string })?.code ?? null,
        reason: (error as { message?: string })?.message ?? null,
        token_iss: claims.iss ?? null,
        token_aud: audValue ?? null,
        token_azp: (claims as { azp?: string }).azp ?? null,
        expected_iss: issuer,
        expected_aud: resource,
      })
    } catch {
      console.error("[mcp-oauth] token verify failed; token not a decodable JWT", {
        code: (error as { code?: string })?.code ?? null,
      })
    }
    return null
  }
}

export async function entitlementForUser(userId: string): Promise<Entitlement> {
  const { data, error } = await supabaseAdmin.from("subscriptions").select("status, plan, current_period_end").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  const subscriptionEntitlement = computeEntitlement(data)
  if (subscriptionEntitlement.isActive) return subscriptionEntitlement
  const { data: firmClient, error: firmError } = await supabaseAdmin
    .from("firm_clients")
    .select("created_at, firms!inner(status)")
    .eq("user_id", userId)
    .eq("firms.status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (firmError) throw new Error(firmError.message)
  return computeFirmClientEntitlement(firmClient?.created_at)
}
