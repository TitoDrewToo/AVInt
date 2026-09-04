import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { readVirtualModel } from "@/lib/virtual-model"
import { checkRateLimit } from "@/lib/rate-limit"
import { serverError } from "@/lib/api-error"

const VALID_STATUSES = new Set(["derived", "reviewed", "superseded"])

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit("reports", `data-model:${auth.user.id}`, 60, 240))) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  const params = request.nextUrl.searchParams
  const status = params.get("status") ?? undefined
  if (status && !VALID_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  try {
    const model = await readVirtualModel(auth.user.id, {
      search: params.get("search")?.slice(0, 120) || undefined,
      status: status as "derived" | "reviewed" | "superseded" | undefined,
      documentType: params.get("document_type")?.slice(0, 80) || undefined,
      fieldKey: params.get("field_key")?.slice(0, 120) || undefined,
      customOnly: params.get("custom_only") === "true",
      page: Number.parseInt(params.get("page") ?? "0", 10) || 0,
      pageSize: Number.parseInt(params.get("page_size") ?? "40", 10) || 40,
    })
    return NextResponse.json(model)
  } catch (error) {
    return serverError(error, { route: "data-model", stage: "read", userId: auth.user.id })
  }
}
