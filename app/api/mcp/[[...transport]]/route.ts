import { createMcpHandler } from "mcp-handler"
import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/entitlement"
import { entitlementForUser, OAuthAccountRequiredError, resolveOAuthToken, supabaseAdmin, withMcpStage } from "@/lib/mcp-auth"
import { MCP_CONNECTOR_ENABLED, MCP_OAUTH_ENABLED, MCP_RATE_LIMITS, oauthProtectedResourceUrl, upgradeMessage } from "@/lib/mcp-config"
import { checkRateLimit, type RateLimitBucket } from "@/lib/rate-limit"
import { type IngestFile } from "@/lib/smart-storage-ingest"
import { getIngestBatchStatus, IngestBatchConflictError, ingestFileBatch } from "@/lib/mcp-ingest-batch"
import { getExport, getReport } from "@/lib/report-engine"
import { shapeMcpReportResult } from "@/lib/mcp-report-shaping"
import { buildDashboardAIContext } from "@/lib/dashboard-ai-context"
import { readVirtualModel } from "@/lib/virtual-model"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"
import { corsPreflight, withCors } from "@/lib/mcp-cors"
import { createReportDefinition, getReportDefinition, listReportDefinitions, ReportDefinitionConflictError, ReportDefinitionNotFoundError, updateReportDefinition } from "@/lib/report-definition-store"
import { ReportDefinitionExecutionError, runReportDefinition } from "@/lib/report-definition-engine"
import { listSavedDashboardWidgets, saveDashboardWidget } from "@/lib/dashboard-widget-store"
import { createDashboardPage, deleteDashboardPage, ensureDefaultDashboardPages, renameDashboardPage, resolveDashboardPage } from "@/lib/dashboard-pages"
import { logApiError } from "@/lib/api-error"
import { rejectStatelessSubscriptionRequest, STATELESS_MCP_CAPABILITIES } from "@/lib/mcp-stateless-transport"

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

function mcpToolError(error: unknown, userId: string, stage: string, fallback: string) {
  if (error instanceof TypeError || error instanceof IngestBatchConflictError || error instanceof ReportDefinitionNotFoundError || error instanceof ReportDefinitionConflictError || error instanceof ReportDefinitionExecutionError) {
    return featureResult(error.message)
  }
  logApiError(error, { route: "mcp", stage, userId })
  return featureResult(fallback)
}

async function toolGuard(userId: string, entitlement: ReturnType<typeof computeEntitlement>, tool: "ingest" | "report" | "export" | "profile") {
  return withMcpStage(`toolGuard_${tool}_rate_limit`, async () => {
    if (entitlement.tier !== "pro" && entitlement.tier !== "business") {
      return featureResult(`Smart Storage MCP access is a Pro or Business feature — view plans at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com"}/pricing.`)
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
  })
}

async function timedTool<T>(name: string, operation: () => Promise<T>): Promise<T> {
  return withMcpStage(`tool_handler_${name}`, operation)
}

async function logJsonRpcMethod(req: NextRequest) {
  let method = "unknown"
  let name = "unknown"
  try {
    const body = await req.clone().json() as { method?: unknown; params?: { name?: unknown } }
    if (typeof body.method === "string") method = body.method
    if (typeof body.params?.name === "string") name = body.params.name
  } catch {
    // Leave the request untouched and log an unknown method when its clone is not readable.
  }
  console.info(`[mcp-stage] stage=jsonrpc_method method=${method} name=${name}`)
}

function buildHandler(userId: string, entitlement: ReturnType<typeof computeEntitlement>) {
  return createMcpHandler((server) => {
    server.registerTool("smart_storage.ingest", {
      title: "Smart Storage ingest",
      description: "Queue up to 6 financial documents for the signed-in user's Smart Storage. Duplicate bytes are refused by default before extraction; set allow_duplicate true only when you intentionally want another copy. Provide a new UUID idempotency key and reuse that exact key when retrying the same ordered files. Each file is prescanned independently; the response returns stable IDs immediately while normalization continues.",
      inputSchema: z.object({ idempotency_key: z.string().uuid(), files: z.array(fileSchema).min(1).max(6), allow_duplicate: z.boolean().optional().default(false) }),
    }, async ({ idempotency_key, files, allow_duplicate }) => timedTool("smart_storage.ingest", async () => {
      const blocked = await toolGuard(userId, entitlement, "ingest")
      if (blocked) return blocked
      try {
        const batch = await ingestFileBatch(userId, entitlement, idempotency_key, files as IngestFile[], { allowDuplicate: allow_duplicate })
        return { content: [{ type: "text", text: JSON.stringify(batch, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "ingest", "The ingest batch could not be queued.") }
    }))

    server.registerTool("smart_storage.ingest_status", {
      title: "Smart Storage ingest status",
      description: "Read-only. Check a resumable ingest batch by the exact idempotency key used to create it. Returns stable file IDs and per-file processing, completion, rejection, or retry status.",
      inputSchema: z.object({ idempotency_key: z.string().uuid() }),
    }, async ({ idempotency_key }) => timedTool("smart_storage.ingest_status", async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      try {
        const batch = await getIngestBatchStatus(userId, idempotency_key)
        return { content: [{ type: "text", text: JSON.stringify(batch, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "ingest_status", "The ingest batch status could not be loaded.") }
    }))

    server.registerTool("smart_storage.profile", {
      title: "Smart Storage data profile",
      description: "Read-only. Describe the signed-in user's normalized data model. activeRecordCount counts active top-level records; readyRecordCount counts that same set excluding records flagged needs_review; attentionCount counts the flagged remainder. Document types, currencies, and recent records describe ready records only. Use this before suggesting a dashboard visual or other custom output.",
      inputSchema: z.object({}),
    }, async () => timedTool("smart_storage.profile", async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      const profile = await buildDashboardAIContext(userId)
      return { content: [{ type: "text", text: JSON.stringify(profile, null, 2) }] }
    }))

    server.registerTool("smart_storage.virtual_model", {
      title: "Smart Storage virtual data model",
      description: "Read-only. Inspect the signed-in user's bounded active records, typed attributes, custom-field catalog, source files, lifecycle status, review state, confidence, and provenance. Excluded records are omitted by default; request includeExcluded only when historical or removed rows are relevant. The response reports when the 40-record bound truncated results. Never invent fields or values not returned here.",
      inputSchema: z.object({
        search: z.string().max(120).optional(),
        status: z.enum(["derived", "reviewed", "superseded"]).optional(),
        documentType: z.string().max(80).optional(),
        fieldKey: z.string().max(120).optional(),
        customOnly: z.boolean().optional().default(false),
        includeExcluded: z.boolean().optional().default(false),
      }),
    }, async ({ search, status, documentType, fieldKey, customOnly, includeExcluded }) => timedTool("smart_storage.virtual_model", async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      const model = await readVirtualModel(userId, { search, status, documentType, fieldKey, customOnly, includeExcluded })
      return { content: [{ type: "text", text: JSON.stringify({ ...model, bounded: true, maxRecords: 40, truncationGuidance: model.truncated ? "Results are partial. Narrow by status, documentType, fieldKey, or search before drawing conclusions." : null }, null, 2) }] }
    }))

    server.registerTool("smart_storage.report", {
      title: "Smart Storage report",
      description: "Read-only. Compute a tax bundle (Schedule C-style) or business-expense report over the signed-in AVIntelligence user's own stored documents, optionally scoped to a date period and folder (including descendants). Returns JSON; does not modify any data.",
      inputSchema: z.object({ type: z.enum(["tax_bundle", "business_expense"]), period: periodSchema, includeRows: z.boolean().optional().default(false) }),
    }, async ({ type, period, includeRows }) => timedTool("smart_storage.report", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      const report = type === "tax_bundle" ? "tax-bundle" : "business-expense"
      const result = await getReport(userId, entitlement, report, period ?? {})
      return { content: [{ type: "text", text: JSON.stringify(shapeMcpReportResult(result, includeRows), null, 2) }] }
    }))

    server.registerTool("smart_storage.list_report_definitions", {
      title: "List saved Smart Storage reports",
      description: "Read-only. List the signed-in user's refreshable saved report definitions, optionally matching a report name. Use the returned exact slug with smart_storage.run_report_definition.",
      inputSchema: z.object({ search: z.string().max(120).optional() }),
    }, async ({ search }) => timedTool("smart_storage.list_report_definitions", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const definitions = await listReportDefinitions(userId, search)
        return { content: [{ type: "text" as const, text: JSON.stringify({ definitions }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "list_report_definitions", "Saved reports could not be loaded.") }
    }))

    server.registerTool("smart_storage.run_report_definition", {
      title: "Run a saved Smart Storage report",
      description: "Read-only. Resolve an exact owned report slug and recompute it from the current normalized records or dataset. Returns the same guarded ReportDocument used by the AVIntelligence UI and PDF renderer.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.run_report_definition", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const definition = await getReportDefinition(userId, slug)
        const document = await runReportDefinition(userId, definition)
        return { content: [{ type: "text" as const, text: JSON.stringify({ definition: { slug: definition.slug, version: definition.version }, document }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "run_report_definition", "The saved report could not be run.") }
    }))

    server.registerTool("smart_storage.save_report_definition", {
      title: "Save a refreshable Smart Storage report",
      description: "Create or update a report definition using only the declarative AVIntelligence contract. Never submit SQL, HTML, executable expressions, or computed snapshot rows. Inspect smart_storage.virtual_model first and use only returned fields. To update, provide the exact slug and expectedVersion.",
      inputSchema: z.object({
        definition: z.record(z.string(), z.unknown()),
        slug: z.string().min(1).max(80).optional(),
        expectedVersion: z.number().int().positive().optional(),
      }),
    }, async ({ definition, slug, expectedVersion }) => timedTool("smart_storage.save_report_definition", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const saved = slug
          ? await updateReportDefinition(userId, slug, definition, expectedVersion ?? 0, "assistant")
          : await createReportDefinition(userId, definition, "assistant")
        return { content: [{ type: "text" as const, text: JSON.stringify({ definition: saved, next: `Run ${saved.slug} to validate it against current data.` }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "save_report_definition", "The saved report could not be written.") }
    }))

    server.registerTool("smart_dashboard.list_visuals", {
      title: "List saved Smart Dashboard visuals",
      description: "Read-only. List the signed-in user's saved generated visuals and whether each is plotted on the dashboard.",
      inputSchema: z.object({ page_slug: z.string().min(1).max(80).optional() }),
    }, async ({ page_slug }) => timedTool("smart_dashboard.list_visuals", async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify({ visuals: await listSavedDashboardWidgets(userId, page_slug) }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "list_visuals", "Dashboard visuals could not be loaded.") }
    }))

    server.registerTool("smart_dashboard.list_pages", {
      title: "List Smart Dashboard pages",
      description: "Read-only. List the signed-in user's ordered dashboard pages and stable slugs. Use this before targeting a visual or changing a page.",
      inputSchema: z.object({}),
    }, async () => timedTool("smart_dashboard.list_pages", async () => {
      const blocked = await toolGuard(userId, entitlement, "profile")
      if (blocked) return blocked
      try {
        const pages = (await ensureDefaultDashboardPages(userId)).map(({ id, name, slug, kind, position }) => ({ id, name, slug, kind, position }))
        return { content: [{ type: "text" as const, text: JSON.stringify({ pages }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "list_pages", "Dashboard pages could not be loaded.") }
    }))

    server.registerTool("smart_dashboard.create_page", {
      title: "Create a Smart Dashboard page",
      description: "Create a named dashboard page for a project, topic, client, property, period, or other user-defined view. Returns its stable slug for visual targeting.",
      inputSchema: z.object({ name: z.string().trim().min(1).max(80) }),
    }, async ({ name }) => timedTool("smart_dashboard.create_page", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const { page } = await createDashboardPage(userId, name)
        return { content: [{ type: "text" as const, text: JSON.stringify({ page }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "create_page", "The dashboard page could not be created.") }
    }))

    server.registerTool("smart_dashboard.update_page", {
      title: "Rename a Smart Dashboard page",
      description: "Rename one dashboard page without changing its stable slug or saved visual targets.",
      inputSchema: z.object({ page_slug: z.string().min(1).max(80), name: z.string().trim().min(1).max(80) }),
    }, async ({ page_slug, name }) => timedTool("smart_dashboard.update_page", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const page = await resolveDashboardPage(userId, page_slug)
        const result = await renameDashboardPage(userId, page.id, name)
        return { content: [{ type: "text" as const, text: JSON.stringify({ page: result.page }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "update_page", "The dashboard page could not be renamed.") }
    }))

    server.registerTool("smart_dashboard.delete_page", {
      title: "Delete a Smart Dashboard page",
      description: "Delete a dashboard page layout. Smart Storage source data is never deleted; saved visuals move to another page as unplotted items. The account's last page cannot be deleted.",
      inputSchema: z.object({ page_slug: z.string().min(1).max(80) }),
    }, async ({ page_slug }) => timedTool("smart_dashboard.delete_page", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const page = await resolveDashboardPage(userId, page_slug)
        const result = await deleteDashboardPage(userId, page.id)
        return { content: [{ type: "text" as const, text: JSON.stringify({ deletedPage: page.slug, fallbackPage: result.fallbackPageSlug, movedVisuals: result.movedVisuals }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "delete_page", "The dashboard page could not be deleted.") }
    }))

    server.registerTool("smart_dashboard.save_visual", {
      title: "Save a Smart Dashboard visual",
      description: "Save a refreshable visual backed by canonical Smart Storage records or a dataset and optionally plot it on a dashboard page. Inspect smart_storage.virtual_model first. The definition is declarative: source, scope, period, filters, dimension, metric, and limit; SQL and executable expressions are never accepted.",
      inputSchema: z.object({
        widget_type: z.enum(["line-chart", "area-chart", "bar-chart", "pie-chart"]),
        title: z.string().min(1).max(120),
        description: z.string().max(500).nullable().optional(),
        insight: z.string().max(800).nullable().optional(),
        definition: z.record(z.string(), z.unknown()),
        page_slug: z.string().min(1).max(80).optional(),
        plot: z.boolean().optional().default(true),
      }),
    }, async ({ widget_type, title, description, insight, definition, page_slug, plot }) => timedTool("smart_dashboard.save_visual", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const visual = await saveDashboardWidget(userId, { widget_type, title, description: description ?? null, insight: insight ?? null, definition }, plot, page_slug)
        return { content: [{ type: "text" as const, text: JSON.stringify({ visual, plotted: plot }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "save_visual", "The dashboard visual could not be saved.") }
    }))

    server.registerTool("smart_storage.export", {
      title: "Smart Storage export",
      description: "Read-only. Generate import-ready accounting file text (QuickBooks 3-col, QuickBooks 4-col, or Xero) from the signed-in AVIntelligence user's own stored expenses, optionally scoped to a date period and folder (including descendants). Returns CSV text; does not modify any data.",
      inputSchema: z.object({ target: z.enum(["quickbooks_3col", "quickbooks_4col", "xero"]), period: periodSchema }),
    }, async ({ target, period }) => timedTool("smart_storage.export", async () => {
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
    }))
  }, {
    serverInfo: { name: "avintelligence-smart-storage", version: "1.0.0" },
    capabilities: STATELESS_MCP_CAPABILITIES,
    instructions: [
      "AVIntelligence Smart Storage, operated by AVIntelligence (https://www.avintph.com).",
      "A document-intelligence service that turns a user's files into a permissioned normalized data model, dashboards, structured outputs, and selected accounting exports.",
      "Every tool acts ONLY on the documents belonging to the signed-in AVIntelligence account, matched by the authenticated email. No data is shared across accounts.",
      "Access requires an active Pro or Business plan. Authentication is handled via AVIntelligence's OAuth (WorkOS); this server never receives passwords.",
      "Tools: smart_storage.ingest and smart_storage.ingest_status (resumable document ingestion), smart_storage.profile and smart_storage.virtual_model (inspect the data model), smart_storage.report (fixed examples), smart_storage.list_report_definitions and smart_storage.run_report_definition (saved refreshable reports), smart_storage.save_report_definition (create or update a validated declarative report), smart_storage.export (QuickBooks / Xero file), smart_dashboard.list_pages / create_page / update_page / delete_page (manage dashboard pages), and smart_dashboard.list_visuals / smart_dashboard.save_visual (inspect or save validated dashboard visuals). Read tools never modify data; save tools affect only the signed-in user's reports or dashboard.",
    ].join(" "),
  })
}

async function handle(req: NextRequest) {
  if (!MCP_CONNECTOR_ENABLED) return withCors(req, NextResponse.json({ error: "Not found" }, { status: 404 }))
  const requestStartedAt = Date.now()
  console.info(`[mcp-stage] stage=request_received elapsed_ms=0 method=${req.method}`)
  const unsupportedSubscription = await rejectStatelessSubscriptionRequest(req)
  if (unsupportedSubscription) {
    console.info(`[mcp-stage] stage=stateless_subscription_rejected elapsed_ms=${Date.now() - requestStartedAt}`)
    return withCors(req, unsupportedSubscription)
  }
  console.info(`[mcp-stage] stage=resolveOAuthToken_start elapsed_ms=${Date.now() - requestStartedAt}`)
  let identity: { userId: string } | null
  try {
    identity = await resolveOAuthToken(req)
  } catch (error) {
    if (error instanceof OAuthAccountRequiredError) return withCors(req, NextResponse.json({ error: error.message }, { status: 403 }))
    return withCors(req, NextResponse.json({ error: "OAuth authentication failed" }, { status: 401 }))
  }
  if (!identity) {
    const headers = new Headers()
    if (MCP_OAUTH_ENABLED) {
      const metadata = oauthProtectedResourceUrl()
      if (metadata) headers.set("WWW-Authenticate", `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${metadata}"`)
    }
    return withCors(req, NextResponse.json({ error: "Unauthorized" }, { status: 401, headers }))
  }
  try {
    const entitlement = await withMcpStage("entitlementForUser_route", () => entitlementForUser(identity.userId))
    await logJsonRpcMethod(req)
    const handlerStartedAt = Date.now()
    const response = await buildHandler(identity.userId, entitlement)(req)
    console.info(`[mcp-stage] stage=handler_returned elapsed_ms=${Date.now() - handlerStartedAt}`)
    return withCors(req, response)
  } catch (error) {
    return withCors(req, NextResponse.json({ error: error instanceof Error ? error.message : "MCP request failed" }, { status: 500 }))
  }
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req)
}
export const GET = handle
export const POST = handle
export const DELETE = handle
