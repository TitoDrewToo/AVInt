import { NextRequest, NextResponse } from "next/server"

import { reconcileOrphanedInboxObjects, reconcileStalePrescans } from "@/lib/storage-reconciliation-server"

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const inbox = await reconcileOrphanedInboxObjects({ dryRun: false })
    const prescans = await reconcileStalePrescans({ dryRun: false })
    return NextResponse.json({ ...inbox, prescans })
  } catch (error) {
    console.error("[cron/reconcile-inbox] failed", error)
    return NextResponse.json({ error: "Storage reconciliation failed" }, { status: 500 })
  }
}
