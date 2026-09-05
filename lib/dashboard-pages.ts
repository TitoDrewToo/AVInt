import { supabaseAdmin } from "@/lib/mcp-auth"
import { dashboardPageId, dashboardPageName, dashboardPageOrder, dashboardPageSlug, MAX_DASHBOARD_PAGES } from "@/lib/dashboard-page-contract"

export type DashboardPage = { id: string; user_id: string; name: string; slug: string; kind: "personal" | "business" | "custom"; position: number; layout?: Record<string, unknown> }

export class DashboardPageNotFoundError extends TypeError {}
export class DashboardPageConflictError extends TypeError {}

const PAGE_SELECT = "id, user_id, name, slug, kind, position"

async function selectPages(userId: string) {
  const { data, error } = await supabaseAdmin.from("dashboard_pages").select(PAGE_SELECT).eq("user_id", userId).order("position").order("created_at")
  if (error) throw new Error(error.message)
  return (data ?? []) as DashboardPage[]
}

export async function ensureDefaultDashboardPages(userId: string) {
  const defaults = [
    { user_id: userId, name: "Personal", slug: "personal", kind: "personal", position: 0 },
    { user_id: userId, name: "Business", slug: "business", kind: "business", position: 1 },
  ]
  const existing = await selectPages(userId)
  if (!existing.length) {
    const { error: insertError } = await supabaseAdmin.from("dashboard_pages").upsert(defaults, { onConflict: "user_id,slug", ignoreDuplicates: true })
    if (insertError) throw new Error(insertError.message)
  }
  const pages = existing.length ? existing : await selectPages(userId)
  const firstPage = pages[0]
  if (firstPage) {
    const { error: legacyWidgetError } = await supabaseAdmin.from("advanced_widgets").update({ page_id: firstPage.id }).eq("user_id", userId).is("page_id", null)
    if (legacyWidgetError) throw new Error(legacyWidgetError.message)
  }
  return pages
}

export async function resolveDashboardPage(userId: string, slug?: string, fallback = false) {
  const pages = await ensureDefaultDashboardPages(userId)
  const page = slug ? pages.find((candidate) => candidate.slug === slug) ?? (fallback ? pages[0] : null) : pages[0]
  if (!page) throw new DashboardPageNotFoundError("Dashboard page does not exist")
  return page
}

export async function loadDashboardPageLayout(userId: string, idInput: unknown) {
  const id = dashboardPageId(idInput)
  const { data, error } = await supabaseAdmin.from("dashboard_pages").select("layout").eq("id", id).eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DashboardPageNotFoundError("Dashboard page does not exist")
  return data.layout && typeof data.layout === "object" && !Array.isArray(data.layout) ? data.layout as Record<string, unknown> : {}
}

export async function createDashboardPage(userId: string, input: unknown) {
  const name = dashboardPageName(input)
  const { data, error } = await supabaseAdmin.rpc("create_dashboard_page", { p_user_id: userId, p_name: name, p_slug_base: dashboardPageSlug(name), p_max_pages: MAX_DASHBOARD_PAGES })
  if (error) {
    if (error.message.includes("limit reached")) throw new DashboardPageConflictError(`A workspace can contain up to ${MAX_DASHBOARD_PAGES} dashboard pages`)
    throw new Error(error.message)
  }
  const page = (Array.isArray(data) ? data[0] : data) as DashboardPage | null
  if (!page) throw new Error("Dashboard page could not be created")
  return { page, pages: await selectPages(userId) }
}

export async function renameDashboardPage(userId: string, idInput: unknown, nameInput: unknown) {
  const id = dashboardPageId(idInput); const name = dashboardPageName(nameInput)
  const { data, error } = await supabaseAdmin.from("dashboard_pages").update({ name, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select(PAGE_SELECT).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new DashboardPageNotFoundError("Dashboard page does not exist")
  return { page: data as DashboardPage, pages: await selectPages(userId) }
}

export async function reorderDashboardPages(userId: string, input: unknown) {
  const ids = dashboardPageOrder(input)
  const { error } = await supabaseAdmin.rpc("reorder_dashboard_pages", { p_user_id: userId, p_page_ids: ids })
  if (error) {
    if (error.message.includes("every owned page")) throw new DashboardPageConflictError("Page order must contain every dashboard page exactly once")
    throw new Error(error.message)
  }
  return { pages: await selectPages(userId) }
}

export async function deleteDashboardPage(userId: string, idInput: unknown) {
  const id = dashboardPageId(idInput)
  const { data, error } = await supabaseAdmin.rpc("delete_dashboard_page", { p_user_id: userId, p_page_id: id })
  if (error) {
    if (error.message.includes("does not exist")) throw new DashboardPageNotFoundError("Dashboard page does not exist")
    if (error.message.includes("last dashboard page")) throw new DashboardPageConflictError("The last dashboard page cannot be deleted")
    throw new Error(error.message)
  }
  return { ...(data as { deletedPageId: string; fallbackPageId: string; fallbackPageSlug: string; movedVisuals: number }), pages: await selectPages(userId) }
}
