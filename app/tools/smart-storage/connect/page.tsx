import { notFound } from "next/navigation"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED } from "@/lib/mcp-config"
import ConnectClient from "./connect-client"

export default function SmartStorageConnectPage() {
  if (!MCP_CONNECTOR_ENABLED) notFound()
  return <ConnectClient oauthEnabled={MCP_OAUTH_ENABLED} />
}
