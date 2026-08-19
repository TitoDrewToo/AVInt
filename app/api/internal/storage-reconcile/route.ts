import { NextRequest, NextResponse } from "next/server"

import { reconcileOrphanedInboxObjects } from "@/lib/storage-reconciliation-server"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

export async function POST(request: NextRequest) {
  const admin = await getSystemAdminUser(bearerToken(request.headers.get("authorization")))
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })

  let body: { cleanup?: boolean; limit?: number; stale_hours?: number } = {}
  try {
    if (request.headers.get("content-type")?.includes("application/json")) body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    return NextResponse.json(await reconcileOrphanedInboxObjects({
      dryRun: body.cleanup !== true,
      limit: body.limit,
      staleHours: body.stale_hours,
    }))
  } catch (error) {
    console.error("[storage-reconcile] failed", error)
    return NextResponse.json({ error: "Storage reconciliation failed" }, { status: 500 })
  }
}
