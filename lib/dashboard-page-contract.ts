export const MAX_DASHBOARD_PAGES = 50
export const MAX_DASHBOARD_PAGE_NAME = 80

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function dashboardPageName(value: unknown) {
  if (typeof value !== "string") throw new TypeError("Page name is required")
  const name = value.trim().replace(/\s+/g, " ")
  if (!name || name.length > MAX_DASHBOARD_PAGE_NAME) throw new TypeError("Page name must be 1–80 characters")
  return name
}

export function dashboardPageSlug(name: string) {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/[\s-]+/g, "-")
  return (slug || "dashboard").slice(0, 68).replace(/-+$/g, "") || "dashboard"
}

export function dashboardPageId(value: unknown) {
  if (typeof value !== "string" || !UUID.test(value)) throw new TypeError("Dashboard page id is invalid")
  return value
}

export function dashboardPageOrder(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_DASHBOARD_PAGES) throw new TypeError("Page order must contain 1–50 page ids")
  const ids = value.map(dashboardPageId)
  if (new Set(ids).size !== ids.length) throw new TypeError("Page order cannot contain duplicate ids")
  return ids
}
