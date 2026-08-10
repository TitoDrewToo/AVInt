export const MCP_CONNECTOR_ENABLED = process.env.ENABLE_MCP_CONNECTOR === "true"
export const MCP_OAUTH_ENABLED = MCP_CONNECTOR_ENABLED && process.env.ENABLE_MCP_OAUTH === "true"
// Client bundles cannot read non-public Next.js environment variables. Set
// this alongside ENABLE_MCP_CONNECTOR when enabling the reviewed rollout.
export const MCP_CONNECTOR_CLIENT_ENABLED = process.env.NEXT_PUBLIC_ENABLE_MCP_CONNECTOR === "true"

export function mcpResourceUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return null
  return new URL("/api/mcp", appUrl).toString()
}

export function oauthProtectedResourceUrl() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) return null
  return new URL("/.well-known/oauth-protected-resource", appUrl).toString()
}

export function workosIssuer() {
  const raw = process.env.WORKOS_AUTH_DOMAIN ?? process.env.WORKOS_ISSUER
  if (!raw) return null
  return `${raw.startsWith("http") ? raw : `https://${raw}`}`.replace(/\/+$/, "")
}

function positiveInteger(name: string, fallback: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const MCP_RATE_LIMITS = {
  ingest: { windowSeconds: positiveInteger("MCP_INGEST_BURST_WINDOW_SECONDS", 600), maxCalls: positiveInteger("MCP_INGEST_BURST_MAX", 30) },
  report: { windowSeconds: positiveInteger("MCP_REPORT_BURST_WINDOW_SECONDS", 60), maxCalls: positiveInteger("MCP_REPORT_BURST_MAX", 120) },
  export: { windowSeconds: positiveInteger("MCP_EXPORT_BURST_WINDOW_SECONDS", 60), maxCalls: positiveInteger("MCP_EXPORT_BURST_MAX", 30) },
  globalIngest: { windowSeconds: positiveInteger("INGEST_GLOBAL_WINDOW_SECONDS", 60), maxCalls: positiveInteger("INGEST_GLOBAL_RPM", 60) },
} as const
export const MCP_CONNECTOR_URL = "/tools/smart-storage/connect"

export function upgradeMessage(tier: string, limit: number, kind: string) {
  return `You've hit your ${tier} ${kind} limit (${limit}). Upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}; your records are saved.`
}
