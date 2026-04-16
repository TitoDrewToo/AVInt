import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import {
  BUSINESS_EXPENSE_SCOPE,
  getDefaultBusinessExpenseAssumptions,
  normalizeBusinessExpenseAssumptions,
} from "@/lib/report-assumptions"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authorize(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  return { user }
}

function getScope(req: NextRequest) {
  const scope = new URL(req.url).searchParams.get("scope") ?? BUSINESS_EXPENSE_SCOPE
  return scope === BUSINESS_EXPENSE_SCOPE ? scope : null
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req)
  if ("error" in auth) return auth.error

  const scope = getScope(req)
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 422 })

  const { data, error } = await supabaseAdmin
    .from("report_assumptions")
    .select("filing_context, federal_marginal_rate, state_marginal_rate, include_self_employment_tax, self_employment_tax_rate, notes")
    .eq("user_id", auth.user.id)
    .eq("scope", scope)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const assumptions = data
    ? normalizeBusinessExpenseAssumptions(data)
    : getDefaultBusinessExpenseAssumptions()

  return NextResponse.json({ scope, assumptions })
}

export async function PUT(req: NextRequest) {
  const auth = await authorize(req)
  if ("error" in auth) return auth.error

  let body: { scope?: string; assumptions?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const scope = body.scope === BUSINESS_EXPENSE_SCOPE ? body.scope : null
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 422 })

  const assumptions = normalizeBusinessExpenseAssumptions(
    (typeof body.assumptions === "object" && body.assumptions !== null)
      ? body.assumptions as Record<string, unknown>
      : null,
  )

  const payload = {
    user_id: auth.user.id,
    scope,
    ...assumptions,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from("report_assumptions")
    .upsert(payload, { onConflict: "user_id,scope" })
    .select("filing_context, federal_marginal_rate, state_marginal_rate, include_self_employment_tax, self_employment_tax_rate, notes")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    scope,
    assumptions: normalizeBusinessExpenseAssumptions(data),
  })
}
