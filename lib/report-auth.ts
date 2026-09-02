import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement, computeFirmClientEntitlement, type Entitlement } from "@/lib/entitlement"
import { serverError } from "@/lib/api-error"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function authorizeReportRequest(req: NextRequest, _reportKey: string, exportFormat: string | null) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: subRow, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle()
  if (subErr) return { error: serverError(subErr, { route: "reports/[report]", stage: "entitlement", userId: user.id }) }

  let ent = computeEntitlement(subRow)
  if (!ent.isActive) {
    const { data: firmClient, error: firmError } = await supabaseAdmin
      .from("firm_clients")
      .select("created_at, firms!inner(status)")
      .eq("user_id", user.id)
      .eq("firms.status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (firmError) return { error: serverError(firmError, { route: "reports/[report]", stage: "firm_entitlement", userId: user.id }) }
    ent = computeFirmClientEntitlement(firmClient?.created_at)
  }
  if (exportFormat && !["quickbooks", "xero"].includes(exportFormat)) return { error: NextResponse.json({ error: "Unsupported export format" }, { status: 400 }) }
  if (exportFormat && !PLAN_LIMITS[ent.tier].accountingExports) {
    return { error: NextResponse.json({ error: "QuickBooks and Xero exports require Day Pass or Pro access. Upgrade to export categorized transactions.", code: "ACCOUNTING_EXPORT_REQUIRES_PAID_PLAN" }, { status: 403 }) }
  }
  return { user, ent }
}

export async function claimReportExport(reportKey: string, userId: string, ent: Entitlement) {
  const limit = PLAN_LIMITS[ent.tier].reportExports
  if (limit === null) return { allowed: true, alreadyClaimed: false, usedCount: null, limitCount: null }
  const usageWindow = usageWindowForTier(ent.tier, new Date(), ent.expiresAt)
  const { data: usageRows, error: usageError } = await supabaseAdmin.rpc("avint_claim_report_export", {
    p_user_id: userId,
    p_report_key: reportKey,
    p_period_start: usageWindow.start,
    p_period_end: usageWindow.end,
    p_limit: limit,
  })
  if (usageError) return { error: serverError(usageError, { route: "reports/[report]", stage: "report_usage", userId }) }
  const usage = usageRows?.[0]
  if (!usage?.allowed) return { error: NextResponse.json({ error: `You have used ${usage?.used_count ?? 0} of ${usage?.limit_count ?? limit} report exports this period. Upgrade for unlimited exports.`, code: "REPORT_EXPORT_LIMIT_REACHED", used_count: usage?.used_count ?? 0, limit_count: usage?.limit_count ?? limit }, { status: 429 }) }
  return { allowed: true, alreadyClaimed: Boolean(usage.already_claimed), usedCount: usage.used_count ?? null, limitCount: usage.limit_count ?? limit }
}
