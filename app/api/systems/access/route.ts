import { NextRequest, NextResponse } from "next/server"

import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

export async function GET(req: NextRequest) {
  const user = await getSystemAdminUser(bearerToken(req.headers.get("authorization")))
  return NextResponse.json({ allowed: Boolean(user) }, { status: user ? 200 : 403 })
}
