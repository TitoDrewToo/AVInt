import { supabaseAdmin } from "@/lib/mcp-auth"

export type DashboardPage = { id: string; user_id: string; name: string; slug: string; kind: "personal" | "business" | "custom"; position: number; layout?: Record<string, unknown> }

export async function ensureDefaultDashboardPages(userId: string) {
  const defaults = [
    { user_id: userId, name: "Personal", slug: "personal", kind: "personal", position: 0 },
    { user_id: userId, name: "Business", slug: "business", kind: "business", position: 1 },
  ]
  const { data: existing, error: existingError } = await supabaseAdmin.from("dashboard_pages").select("id, user_id, name, slug, kind, position, layout").eq("user_id", userId).order("position").order("created_at")
  if (existingError) throw new Error(existingError.message)
  const existingSlugs = new Set((existing ?? []).map((page) => page.slug))
  const missing = defaults.filter((page) => !existingSlugs.has(page.slug))
  if (missing.length) {
    const { error: insertError } = await supabaseAdmin.from("dashboard_pages").upsert(missing, { onConflict: "user_id,slug", ignoreDuplicates: true })
    if (insertError) throw new Error(insertError.message)
  }
  const { data, error } = missing.length
    ? await supabaseAdmin.from("dashboard_pages").select("id, user_id, name, slug, kind, position, layout").eq("user_id", userId).order("position").order("created_at")
    : { data: existing, error: null }
  if (error) throw new Error(error.message)
  const pages = (data ?? []) as DashboardPage[]
  const personal = pages.find((page) => page.slug === "personal")
  if (personal) {
    const { error: legacyWidgetError } = await supabaseAdmin.from("advanced_widgets").update({ page_id: personal.id }).eq("user_id", userId).is("page_id", null)
    if (legacyWidgetError) throw new Error(legacyWidgetError.message)
  }
  return pages
}

export async function resolveDashboardPage(userId: string, slug = "personal") {
  const pages = await ensureDefaultDashboardPages(userId)
  const page = pages.find((candidate) => candidate.slug === slug)
  if (!page) throw new TypeError("Dashboard page does not exist")
  return page
}
