import "server-only"

export const FIRM_PARTNER_RATE_CENTS = Number(process.env.FIRM_PARTNER_RATE_CENTS ?? "10000")
export const CREEM_FIRM_SEAT_PRODUCT_ID = process.env.CREEM_FIRM_SEAT_PRODUCT_ID ?? ""

export const FIRM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function normalizeFirmSlug(value: unknown) {
  if (typeof value !== "string") return null
  const slug = value.trim().toLowerCase()
  return FIRM_SLUG_PATTERN.test(slug) ? slug : null
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
