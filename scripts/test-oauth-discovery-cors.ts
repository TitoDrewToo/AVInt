import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import path from "node:path"

const mode = process.argv[2] ?? "configured"

async function main() {
if (mode === "configured") {
  process.env.ENABLE_MCP_CONNECTOR = "true"
  process.env.ENABLE_MCP_OAUTH = "true"
  process.env.NEXT_PUBLIC_APP_URL = "https://www.avintph.com"
  process.env.WORKOS_AUTH_DOMAIN = "https://auth.example.com"
  globalThis.fetch = async () => new Response(JSON.stringify({ issuer: "https://auth.example.com" }), { headers: { "content-type": "application/json" } })

  const protectedRoute = await import("@/app/.well-known/oauth-protected-resource/route")
  const authorizationRoute = await import("@/app/.well-known/oauth-authorization-server/route")
  for (const get of [protectedRoute.GET, authorizationRoute.GET]) {
    const response = await get()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*")
    assert.equal(response.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS")
    assert.equal(response.headers.get("Access-Control-Max-Age"), "600")
  }
  for (const options of [protectedRoute.OPTIONS, authorizationRoute.OPTIONS]) {
    const response = options()
    assert.equal(response.status, 204)
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*")
  }
} else {
  if (mode === "disabled") {
    process.env.ENABLE_MCP_CONNECTOR = "false"
    process.env.ENABLE_MCP_OAUTH = "false"
  } else {
    process.env.ENABLE_MCP_CONNECTOR = "true"
    process.env.ENABLE_MCP_OAUTH = "true"
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.WORKOS_AUTH_DOMAIN
    delete process.env.WORKOS_ISSUER
  }
  const protectedRoute = await import("@/app/.well-known/oauth-protected-resource/route")
  const authorizationRoute = await import("@/app/.well-known/oauth-authorization-server/route")
  for (const get of [protectedRoute.GET, authorizationRoute.GET]) {
    const response = await get()
    assert.equal(response.status, mode === "disabled" ? 404 : 503)
  }
}

if (mode === "configured") {
  const env = { ...process.env, ENABLE_MCP_CONNECTOR: "false", ENABLE_MCP_OAUTH: "false" }
  execFileSync("pnpm", ["exec", "tsx", path.resolve(process.argv[1]), "disabled"], { env, stdio: "inherit" })
  const unconfiguredEnv = { ...process.env, ENABLE_MCP_CONNECTOR: "true", ENABLE_MCP_OAUTH: "true" }
  delete unconfiguredEnv.NEXT_PUBLIC_APP_URL
  delete unconfiguredEnv.WORKOS_AUTH_DOMAIN
  delete unconfiguredEnv.WORKOS_ISSUER
  execFileSync("pnpm", ["exec", "tsx", path.resolve(process.argv[1]), "unconfigured"], { env: unconfiguredEnv, stdio: "inherit" })
  console.log("OAuth discovery CORS tests: 6 passed")
}
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
