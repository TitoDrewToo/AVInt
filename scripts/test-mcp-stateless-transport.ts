import assert from "node:assert/strict"
import { createMcpHandler } from "mcp-handler"

async function main() {
  process.env.ENABLE_MCP_CONNECTOR = "true"
  process.env.ENABLE_MCP_OAUTH = "true"
  process.env.NEXT_PUBLIC_APP_URL = "https://www.avintph.com"
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co"
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"

  const requestBody = {
    jsonrpc: "2.0",
    id: 42,
    method: "subscriptions/listen",
    params: { notifications: { toolsListChanged: true } },
  }
  const route = await import("@/app/api/mcp/[[...transport]]/route")
  const { rejectStatelessSubscriptionRequest, STATELESS_MCP_CAPABILITIES } = await import("@/lib/mcp-stateless-transport")
  assert.deepEqual(STATELESS_MCP_CAPABILITIES, { tools: { listChanged: false } })

  for (const method of ["resources/subscribe", "resources/unsubscribe", "subscriptions/custom"]) {
    const rejected = await rejectStatelessSubscriptionRequest(new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method }),
    }))
    assert.equal(rejected?.status, 200, `${method} was not rejected`)
    assert.ok(rejected)
    assert.equal((await rejected.json()).error.code, -32601)
  }
  assert.equal(await rejectStatelessSubscriptionRequest(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  })), null)

  const isolatedHandler = createMcpHandler(() => {}, {
    serverInfo: { name: "stateless-capability-test", version: "1" },
    capabilities: STATELESS_MCP_CAPABILITIES,
  })
  const initializeResponse = await isolatedHandler(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }),
  }))
  const initializeBody = await initializeResponse.text()
  assert.match(initializeBody, /"tools":\{"listChanged":false\}/)
  const startedAt = performance.now()
  const response = await route.POST(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  }) as never)
  const body = await response.json()
  const elapsedMs = performance.now() - startedAt

  assert.equal(response.status, 200)
  assert.equal(body.jsonrpc, "2.0")
  assert.equal(body.id, 42)
  assert.deepEqual(body.error, { code: -32601, message: "Method not supported by this stateless server" })
  assert.doesNotMatch(response.headers.get("content-type") ?? "", /text\/event-stream/)
  assert.ok(elapsedMs < 250, `subscription rejection took ${elapsedMs.toFixed(1)}ms`)
  console.log("request", JSON.stringify(requestBody))
  console.log("response", JSON.stringify(body))
  console.log("transport", JSON.stringify({ status: response.status, contentType: response.headers.get("content-type"), elapsedMs: Number(elapsedMs.toFixed(1)), bodyClosed: response.bodyUsed }))
  console.log("initialize", initializeBody.trim())
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
