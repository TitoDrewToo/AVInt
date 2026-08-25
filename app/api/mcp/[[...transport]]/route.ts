import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/entitlement"
import { entitlementForUser, OAuthAccountRequiredError, resolveOAuthToken, supabaseAdmin } from "@/lib/mcp-auth"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, MCP_RATE_LIMITS, oauthProtectedResourceUrl, upgradeMessage } from "@/lib/mcp-config"
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit"
import { ingestFiles } from "@/lib/smart-storage-ingest"
import { getExport, getReport } from "@/lib/report-engine"
import { shapeMcpReportResult } from "@/lib/mcp-report-shaping"
import { buildDashboardAIContext } from "@/lib/dashboard-ai-context"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

const fileSchema = z.object({ name: z.string().min(1).max(255), mimeType: z.string().min(1), data: z.string().min(1) })
const periodSchema = z.object({ dateFrom: z.string().optional(), dateTo: z.string().optional(), targetFolder: z.string().uuid().optional() }).optional()

function capResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: false }
}

function featureResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true }
}

function limitedResult(message: string) {
  return { content: [{ type: "text" as const, text: `${message} Retry after a short pause.` }], isError: true }
}

async function toolGuard(userId: string, entitlement: ReturnType<typeof computeEntitlement>, tool: "ingest" | "report" | "export" | "profile") {
  if (entitlement.tier !== "pro" && entitlement.tier !== "business") {
    return featureResult(`The Claude connector is a Pro feature — contact AVIntelligence at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com"}/studio#studio-inquiry.`)
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
      description: "Upload up to 6 financial documents (receipts, invoices, payslips, statements) to the signed-in AVIntelligence user's own Smart Storage, prescan them, and return normalized structured records. Operates only on the authenticated user's account.",
      inputSchema: z.object({ files: z.array(fileSchema).min(1).max(6) }),
    }, async ({ files }) => {
      const blocked = await toolGuard(userId, entitlement, "ingest")
      if (blocked) return blocked
      const result = await ingestFiles(userId, entitlement, files)
      return { content: [{ type: "text", text: JSON.stringify({ records: result }, null, 2) }] }
    })

    server.registerTool("smart_storage.profile", {
      title: "Smart Storage data profile",
      description: "Read-only. Describe the signed-in user's current normalized data model, available document types, currencies, readiness, and recent records. Use this before suggesting a dashboard visual or other custom output.",
      inputSchema: z.object({}),
    }, async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      const profile = await buildDashboardAIContext(userId)
      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] }
    })

    server.registerTool("smart_storage.report", {
      title: "Smart Storage report",
      description: "Read-only. Compute a tax bundle (Schedule C-style) or business-expense report over the signed-in AVIntelligence user's own stored documents, optionally scoped to a date period and folder (including descendants). Returns JSON; does not modify any data.",
      inputSchema: z.object({ type: z.enum(["tax_bundle", "business_expense"]), period: periodSchema, includeRows: z.boolean().optional().default(false) }),
    }, async ({ type, period, includeRows }) => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      const report = type === "tax_bundle" ? "tax-bundle" : "business-expense"
      const result = await getReport(userId, entitlement, report, period ?? {})
      return { content: [{ type: "text", text: JSON.stringify(shapeMcpReportResult(result, includeRows), null, 2) }] }
    })

    server.registerTool("smart_storage.export", {
      title: "Smart Storage export",
      description: "Read-only. Generate import-ready accounting file text (QuickBooks 3-col, QuickBooks 4-col, or Xero) from the signed-in AVIntelligence user's own stored expenses, optionally scoped to a date period and folder (including descendants). Returns CSV text; does not modify any data.",
      inputSchema: z.object({ target: z.enum(["quickbooks_3col", "quickbooks_4col", "xero"]), period: periodSchema }),
    }, async ({ target, period }) => {
      const blocked = await toolGuard(userId, entitlement, "export")
      if (blocked) return blocked
      if (!PLAN_LIMITS[entitlement.tier].accountingExports) return capResult(`Accounting export isn't available on the ${entitlement.tier} plan; your records are saved. Contact AVIntelligence at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com"}/studio#studio-inquiry.`)
      // Only meter tiers with a finite export limit. null = unlimited (Day Pass / Pro / Business) —
      // mirror the web report route, which skips the claim entirely when reportExports is null.
      const exportLimit = PLAN_LIMITS[entitlement.tier].reportExports
      if (exportLimit !== null) {
        const window = usageWindowForTier(entitlement.tier, new Date(), entitlement.expiresAt)
        const { data, error } = await supabaseAdmin.rpc("avint_claim_report_export", { p_user_id: userId, p_report_key: `mcp:${target}`, p_period_start: window.start, p_period_end: window.end, p_limit: exportLimit })
        if (error) throw new Error(error.message)
        if (!data?.[0]?.allowed) return capResult(upgradeMessage(entitlement.tier, data?.[0]?.limit_count ?? exportLimit, "report export"))
      }
      const report = await getExport(userId, entitlement, "tax-bundle", target, period ?? {})
      return { content: [{ type: "text", text: report }] }
    })
  }, {
    serverInfo: { name: "avintelligence-smart-storage", version: "1.0.0" },
    instructions: [
      "AVIntelligence Smart Storage, operated by AVIntelligence (https://www.avintph.com).",
      "A document-intelligence service that turns a user's files into a permissioned normalized data model, dashboards, structured outputs, and selected accounting exports.",
      "Every tool acts ONLY on the documents belonging to the signed-in AVIntelligence account, matched by the authenticated email. No data is shared across accounts.",
      "Access requires an active Pro or Business plan. Authentication is handled via AVIntelligence's OAuth (WorkOS); this server never receives passwords.",
      "Tools: smart_storage.ingest (add documents), smart_storage.profile (inspect the normalized data model), smart_storage.report (selected report examples), smart_storage.export (QuickBooks / Xero file). Report, profile, and export are read-only.",
    ].join(" "),
  })
}

async function handle(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return NextResponse.json({ error: "Not found" }, { status: 404 })
  let identity: { userId: string } | null
  try {
    identity = await resolveOAuthToken(req)
  } catch (error) {
    if (error instanceof OAuthAccountRequiredError) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ error: "OAuth authentication failed" }, { status: 401 })
  }
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
