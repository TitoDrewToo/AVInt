import assert from "node:assert/strict"

const allowedOrigin = "http://127.0.0.1:6274"
async function main() {
  process.env.ALLOWED_ORIGINS = allowedOrigin
  process.env.ENABLE_MCP_CONNECTOR = "true"
  process.env.ENABLE_MCP_OAUTH = "true"
  process.env.NEXT_PUBLIC_APP_URL = "https://www.avintph.com"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
  const { corsHeadersFor, corsPreflight, withCors } = await import("@/lib/mcp-cors")

const allowedRequest = new Request("http://localhost/api/mcp", { headers: { origin: allowedOrigin } })
const allowedHeaders = corsHeadersFor(allowedRequest)
assert.equal(allowedHeaders.get("Access-Control-Allow-Origin"), allowedOrigin)
assert.equal(allowedHeaders.get("Access-Control-Allow-Methods"), "GET, POST, DELETE, OPTIONS")
assert.equal(allowedHeaders.get("Access-Control-Allow-Headers"), "content-type, authorization, mcp-session-id, mcp-protocol-version")
assert.equal(allowedHeaders.get("Access-Control-Expose-Headers"), "mcp-session-id")
assert.equal(allowedHeaders.get("Access-Control-Max-Age"), "600")
assert.equal(allowedHeaders.get("Vary"), "Origin")
assert.equal(corsPreflight(allowedRequest).status, 204)

const disallowedRequest = new Request("http://localhost/api/mcp", { headers: { origin: "https://attacker.example" } })
assert.equal([...corsHeadersFor(disallowedRequest)].length, 0)
assert.equal([...corsPreflight(disallowedRequest).headers].length, 0)

const unauthorized = withCors(allowedRequest, new Response(JSON.stringify({ error: "Unauthorized" }), {
  status: 401,
  headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://www.avintph.com/.well-known/oauth-protected-resource"' },
}))
assert.equal(unauthorized.status, 401)
assert.equal(unauthorized.headers.get("WWW-Authenticate"), 'Bearer resource_metadata="https://www.avintph.com/.well-known/oauth-protected-resource"')
assert.equal(unauthorized.headers.get("Access-Control-Allow-Origin"), allowedOrigin)

const route = await import("@/app/api/mcp/[[...transport]]/route")
const routePreflight = route.OPTIONS(new Request("http://localhost/api/mcp", { headers: { origin: allowedOrigin } }) as never)
assert.equal(routePreflight.status, 204)
assert.equal(routePreflight.headers.get("Access-Control-Allow-Origin"), allowedOrigin)

const routeUnauthorized = await route.POST(new Request("http://localhost/api/mcp", {
  method: "POST",
  headers: { origin: allowedOrigin, "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
}) as never)
assert.equal(routeUnauthorized.status, 401)
assert.match(routeUnauthorized.headers.get("WWW-Authenticate") ?? "", /resource_metadata=/)
assert.equal(routeUnauthorized.headers.get("Access-Control-Allow-Origin"), allowedOrigin)

  console.log("MCP CORS tests: 5 passed")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
