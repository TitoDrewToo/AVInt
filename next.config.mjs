/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.254.175"],
  images: {
    unoptimized: true,
  },
  async headers() {
    // Content Security Policy (report-only). Observational for now — browsers
    // will log violations to devtools console without blocking. script-src is
    // intentionally tight ('self' only) so Next.js inline hydration scripts
    // surface as violations to migrate to nonces before we flip to
    // enforcement. style-src keeps 'unsafe-inline' — Tailwind + Radix emit
    // runtime inline styles that are impractical to nonce. Listed connect-src
    // origins are the full set of third-party endpoints the client/app hits;
    // anything new will appear in the report.
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://api.creem.io https://test-api.creem.io https://status.supabase.com https://status.creem.io https://status.openai.com https://status.anthropic.com https://status.cloud.google.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")

    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent browsers rendering content as a different MIME type
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Prevent clickjacking — page cannot be embedded in an iframe
          { key: "X-Frame-Options", value: "DENY" },
          // Stop referrer leaking to third-party origins
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable browser features not needed by the app
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Force HTTPS for 1 year
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          // Observational CSP — see violations in devtools; no enforcement
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
      {
        // API routes — tighten further, no caching of sensitive responses
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ]
  },
}

export default nextConfig
