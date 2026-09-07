const SUBSCRIPTION_METHODS = new Set([
  "subscriptions/listen",
  "resources/subscribe",
  "resources/unsubscribe",
])

export const STATELESS_MCP_CAPABILITIES = {
  tools: { listChanged: false },
} as const

function isSubscriptionMethod(method: unknown): method is string {
  return typeof method === "string"
    && (SUBSCRIPTION_METHODS.has(method) || method.startsWith("subscriptions/"))
}

export async function rejectStatelessSubscriptionRequest(request: Request): Promise<Response | null> {
  if (request.method !== "POST" || !request.headers.get("content-type")?.includes("application/json")) return null
  let body: unknown
  try {
    body = await request.clone().json()
  } catch {
    return null
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || !isSubscriptionMethod((body as { method?: unknown }).method)) return null
  const candidateId = (body as { id?: unknown }).id
  const id = typeof candidateId === "string" || typeof candidateId === "number" || candidateId === null ? candidateId : null
  return new Response(JSON.stringify({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: "Method not supported by this stateless server" },
  }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  })
}
