const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "600",
}

export function oauthDiscoveryCorsHeaders() {
  return CORS_HEADERS
}

export function oauthDiscoveryOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
