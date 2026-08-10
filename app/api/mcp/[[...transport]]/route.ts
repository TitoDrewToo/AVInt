import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/entitlement"
import { entitlementForUser, OAuthAccountRequiredError, resolveApiKey, resolveOAuthToken, supabaseAdmin } from "@/lib/mcp-auth"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, MCP_RATE_LIMITS, oauthProtectedResourceUrl, upgradeMessage } from "@/lib/mcp-config"
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit"
import { ingestFiles } from "@/lib/smart-storage-ingest"
import { getExport, getReport } from "@/lib/report-engine"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const fileSchema = z.object({ name: z.string().min(1).max(255), mimeType: z.string().min(1), data: z.string().min(1) })
const periodSchema = z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional() }).optional()

function capResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: false }
}

function featureResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true }
}

function limitedResult(message: string) {
  return { content: [{ type: "text" as const, text: `${message} Retry after a short pause.` }], isError: true }
}

async function toolGuard(userId: string, entitlement: ReturnType<typeof computeEntitlement>, tool: "ingest" | "report" | "export") {
  if (entitlement.tier !== "pro" && entitlement.tier !== "business") {
    return featureResult(`The Claude connector is a Pro feature — upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}.`)
  }
  const config = MCP_RATE_LIMITS[tool]
  const bucket = `mcp-${tool}` as RateLimitBucket
  if (!(await checkRateLimit(bucket, userId, config.windowSeconds, config.maxCalls))) {
    return limitedResult(`You've reached the ${tool} connector burst limit (${config.maxCalls} calls).`)
  }
  if (tool === "ingest" && !(await checkRateLimit("mcp-ingest-global", "global", MCP_RATE_LIMITS.globalIngest.windowSeconds, MCP_RATE_LIMITS.globalIngest.maxCalls))) {
    return limitedResult("Smart Storage is busy processing a high volume of uploads; please retry in a moment.")
  }
  return null
}

function buildHandler(userId: string, entitlement: ReturnType<typeof computeEntitlement>) {
  return createMcpHandler((server) => {
    server.registerTool("smart_storage.ingest", {
      title: "Smart Storage ingest",
      description: "Upload financial documents, prescan them, and return normalized structured records.",
      inputSchema: z.object({ files: z.array(fileSchema).min(1).max(6) }),
    }, async ({ files }) => {
      const blocked = await toolGuard(userId, entitlement, "ingest")
      if (blocked) return blocked
      const result = await ingestFiles(userId, entitlement, files)
      return { content: [{ type: "text", text: JSON.stringify({ records: result }, null, 2) }] }
    })

    server.registerTool("smart_storage.report", {
      title: "Smart Storage report",
      description: "Compute a Smart Storage tax bundle or business expense report for a date period.",
      inputSchema: z.object({ type: z.enum(["tax_bundle", "business_expense"]), period: periodSchema }),
    }, async ({ type, period }) => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      const report = type === "tax_bundle" ? "tax-bundle" : "business-expense"
      const result = await getReport(userId, entitlement, report, period ?? {})
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
    })

    server.registerTool("smart_storage.export", {
      title: "Smart Storage export",
      description: "Generate import-ready QuickBooks or Xero file text.",
      inputSchema: z.object({ target: z.enum(["quickbooks_3col", "quickbooks_4col", "xero"]), period: periodSchema }),
    }, async ({ target, period }) => {
      const blocked = await toolGuard(userId, entitlement, "export")
      if (blocked) return blocked
      if (!PLAN_LIMITS[entitlement.tier].accountingExports) return capResult(`You've hit your ${entitlement.tier} export access limit. Upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}; your records are saved.`)
      const window = usageWindowForTier(entitlement.tier, new Date(), entitlement.expiresAt)
      const { data, error } = await supabaseAdmin.rpc("avint_claim_report_export", { p_user_id: userId, p_report_key: `mcp:${target}`, p_period_start: window.start, p_period_end: window.end, p_limit: PLAN_LIMITS[entitlement.tier].reportExports ?? 1 })
      if (error) throw new Error(error.message)
      if (!data?.[0]?.allowed) return capResult(upgradeMessage(entitlement.tier, data?.[0]?.limit_count ?? 1, "report export"))
      const report = await getExport(userId, entitlement, "tax-bundle", target, period ?? {})
      return { content: [{ type: "text", text: report }] }
    })
  }, { serverInfo: { name: "avintelligence-smart-storage", version: "0.1.0" } })
}

async function handle(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 })
  let identity: { userId: string } | null = null
  try {
    identity = await resolveOAuthToken(req)
  } catch (error) {
    if (error instanceof OAuthAccountRequiredError) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ error: "OAuth authentication failed" }, { status: 401 })
  }
  identity ??= await resolveApiKey(req)
  if (!identity) {
    const headers = new Headers()
    if (MCP_OAUTH_ENABLED) {
      const metadata = oauthProtectedResourceUrl()
      if (metadata) headers.set("WWW-Authenticate", `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${metadata}"`)
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
  }
  try {
    const entitlement = await entitlementForUser(identity.userId)
    return buildHandler(identity.userId, entitlement)(req)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "MCP request failed" }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
export const DELETE = handle
