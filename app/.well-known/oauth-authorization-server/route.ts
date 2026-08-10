import { NextResponse } from "next/server"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, workosIssuer } from "@/lib/mcp-config"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!MCP_CONNECTOR_ENABLED || !MCP_OAUTH_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const issuer = workosIssuer()
  if (!issuer) return NextResponse.json({ error: "OAuth is not configured" }, { status: 503 })
  const response = await fetch(`${issuer}/.well-known/oauth-authorization-server`, { cache: "no-store" })
  if (!response.ok) return NextResponse.json({ error: "Unable to load WorkOS OAuth metadata" }, { status: 503 })
  return NextResponse.json(await response.json(), { headers: { "Cache-Control": "no-store" } })
}
