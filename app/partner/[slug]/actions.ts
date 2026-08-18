"use server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { isUuid } from "@/lib/firm-partnership"

type EnrollmentResult =
  | { ok: true; firmId: string }
  | { ok: false; code: "invalid" | "unauthorized" | "not_found" | "seats_full" | "unavailable" | "error" }

export async function enrollClientByFirmSlug(slugInput: unknown, accessTokenInput: unknown): Promise<EnrollmentResult> {
  const slug = typeof slugInput === "string" ? slugInput.trim().toLowerCase() : ""
  const accessToken = typeof accessTokenInput === "string" ? accessTokenInput.trim() : ""
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !accessToken) return { ok: false, code: "invalid" }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  if (authError || !authData.user || !isUuid(authData.user.id)) return { ok: false, code: "unauthorized" }

  const { data: firm, error: firmError } = await supabaseAdmin
    .from("firms")
    .select("id, status")
    .eq("slug", slug)
    .maybeSingle()
  if (firmError) return { ok: false, code: "error" }
  if (!firm) return { ok: false, code: "not_found" }
  if (firm.status !== "active") return { ok: false, code: "unavailable" }

  const { data, error } = await supabaseAdmin.rpc("enroll_firm_client", {
    p_firm_id: firm.id,
    p_user_id: authData.user.id,
  })
  if (error) return { ok: false, code: "error" }
  if (!data?.ok) return { ok: false, code: data?.code === "seats_full" ? "seats_full" : "unavailable" }
  return { ok: true, firmId: firm.id }
}
