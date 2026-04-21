import { MetadataRoute } from "next"

const BASE_URL = "https://www.avintph.com"

// Block crawlers from authenticated surfaces (/tools/*, /api/*, /auth/*, /purchase/*,
// /signup/*) — these are paid or per-user and have no SEO value.
// Marketing, blog, pricing, and legal remain crawlable and are listed in sitemap.ts.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/auth/", "/tools/", "/purchase/", "/signup/"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  }
}
