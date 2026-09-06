// Smart Storage MCP OAuth smoke test.
//
//   MCP_ACCESS_TOKEN=<workos-oauth-bearer> \
//     node mcp-smoke-test.mjs https://www.avintph.com/api/mcp
//
// Add file paths only when intentionally testing ingestion:
//
//   MCP_ACCESS_TOKEN=<token> node mcp-smoke-test.mjs <url> receipt.png

import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { randomUUID } from "node:crypto"

const [, , url, ...files] = process.argv
const token = process.env.MCP_ACCESS_TOKEN
if (!url || !token) {
  console.error("usage: MCP_ACCESS_TOKEN=<workos-oauth-bearer> node mcp-smoke-test.mjs <MCP_URL> [receipt.png ...]")
  process.exit(1)
}

const { Client } = await import("@modelcontextprotocol/sdk/client/index.js")
const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js")

const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
})
const client = new Client({ name: "avint-mcp-smoke-test", version: "2.0.0" }, { capabilities: {} })

const expectedTools = [
  "smart_storage.ingest",
  "smart_storage.ingest_status",
  "smart_storage.profile",
  "smart_storage.virtual_model",
  "smart_storage.report",
  "smart_storage.list_report_definitions",
  "smart_storage.run_report_definition",
  "smart_storage.save_report_definition",
  "smart_storage.export",
  "smart_dashboard.list_visuals",
  "smart_dashboard.list_pages",
  "smart_dashboard.create_page",
  "smart_dashboard.update_page",
  "smart_dashboard.delete_page",
  "smart_dashboard.save_visual",
]

function ok(label, detail = "") {
  console.log(`✓ ${label}${detail ? `  ${detail}` : ""}`)
}

function fail(label, detail) {
  throw new Error(`${label}: ${detail instanceof Error ? detail.message : String(detail)}`)
}

async function callReadTool(name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  if (result.isError) fail(name, result.content?.[0]?.text ?? "tool returned isError")
  ok(name)
}

try {
  await client.connect(transport)
  ok("OAuth connection")

  const listed = await client.listTools()
  const names = new Set(listed.tools.map((tool) => tool.name))
  const missing = expectedTools.filter((name) => !names.has(name))
  if (missing.length) fail("tools/list", `missing ${missing.join(", ")}`)
  if (listed.tools.length !== expectedTools.length) fail("tools/list", `expected ${expectedTools.length}, received ${listed.tools.length}`)
  ok("tools/list", `${listed.tools.length} tools`)

  // These calls cover both guard buckets without mutating customer data.
  await callReadTool("smart_storage.profile")
  await callReadTool("smart_storage.virtual_model")
  await callReadTool("smart_storage.list_report_definitions")
  await callReadTool("smart_dashboard.list_pages")
  await callReadTool("smart_dashboard.list_visuals")

  if (files.length) {
    const payload = files.map((path) => ({
      name: basename(path),
      mimeType: path.toLowerCase().endsWith(".png")
        ? "image/png"
        : path.toLowerCase().endsWith(".jpg") || path.toLowerCase().endsWith(".jpeg")
          ? "image/jpeg"
          : "application/pdf",
      data: readFileSync(path).toString("base64"),
    }))
    const idempotencyKey = randomUUID()
    const result = await client.callTool({ name: "smart_storage.ingest", arguments: { idempotency_key: idempotencyKey, files: payload } })
    if (result.isError) fail("smart_storage.ingest", result.content?.[0]?.text ?? "tool returned isError")
    ok("smart_storage.ingest", `${payload.length} file(s)`)
    await callReadTool("smart_storage.ingest_status", { idempotency_key: idempotencyKey })
  }

  console.log("MCP authorization smoke test passed")
} finally {
  await client.close().catch(() => undefined)
}
