import { NextResponse } from "next/server"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, mcpResourceUrl, workosIssuer } from "@/lib/mcp-config"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!MCP_CONNECTOR_ENABLED || !MCP_OAUTH_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const resource = mcpResourceUrl()
  const issuer = workosIssuer()
  if (!resource || !issuer) return NextResponse.json({ error: "OAuth is not configured" }, { status: 503 })
  return NextResponse.json({ resource, authorization_servers: [issuer], bearer_methods_supported: ["header"] }, { headers: { "Cache-Control": "no-store" } })
}
