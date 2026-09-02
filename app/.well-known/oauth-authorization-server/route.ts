import { NextResponse } from "next/server"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, workosIssuer } from "@/lib/mcp-config"
import { oauthDiscoveryCorsHeaders, oauthDiscoveryOptions } from "@/lib/oauth-discovery-cors"

export const dynamic = "force-dynamic"

export async function GET() {
  const headers = oauthDiscoveryCorsHeaders()
  if (!MCP_CONNECTOR_ENABLED || !MCP_OAUTH_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404, headers })
  const issuer = workosIssuer()
  if (!issuer) return NextResponse.json({ error: "OAuth is not configured" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } })
  const response = await fetch(`${issuer}/.well-known/oauth-authorization-server`, { cache: "no-store" })
  if (!response.ok) return NextResponse.json({ error: "Unable to load WorkOS OAuth metadata" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } })
  return NextResponse.json(await response.json(), { headers: { ...headers, "Cache-Control": "no-store" } })
}

export function OPTIONS() {
  return oauthDiscoveryOptions()
}
