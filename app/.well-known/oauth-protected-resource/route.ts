import { NextResponse } from "next/server"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, mcpResourceUrl, workosIssuer } from "@/lib/mcp-config"
import { oauthDiscoveryCorsHeaders, oauthDiscoveryOptions } from "@/lib/oauth-discovery-cors"

export const dynamic = "force-dynamic"

export async function GET() {
  const headers = oauthDiscoveryCorsHeaders()
  if (!MCP_CONNECTOR_ENABLED || !MCP_OAUTH_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404, headers })
  const resource = mcpResourceUrl()
  const issuer = workosIssuer()
  if (!resource || !issuer) return NextResponse.json({ error: "OAuth is not configured" }, { status: 503, headers: { ...headers, "Cache-Control": "no-store" } })
  return NextResponse.json({ resource, authorization_servers: [issuer], bearer_methods_supported: ["header"] }, { headers: { ...headers, "Cache-Control": "no-store" } })
}

export function OPTIONS() {
  return oauthDiscoveryOptions()
}
