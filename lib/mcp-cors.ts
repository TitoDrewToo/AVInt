const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const ALLOW_METHODS = "GET, POST, DELETE, OPTIONS"
const ALLOW_HEADERS = "content-type, authorization, mcp-session-id, mcp-protocol-version"
const MAX_AGE = "600"

export function corsHeadersFor(request: Request): Headers {
  const origin = request.headers.get("origin")
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return new Headers()
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": ALLOW_METHODS,
    "Access-Control-Allow-Headers": ALLOW_HEADERS,
    "Access-Control-Expose-Headers": "mcp-session-id",
    "Access-Control-Max-Age": MAX_AGE,
    Vary: "Origin",
  })
}

export function withCors(request: Request, response: Response): Response {
  const corsHeaders = corsHeadersFor(request)
  corsHeaders.forEach((value, key) => response.headers.set(key, value))
  return response
}

export function corsPreflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) })
}
