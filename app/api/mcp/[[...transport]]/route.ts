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
import { validateReportDefinitionPayload } from "@/lib/report-definitions"
import { listSavedDashboardWidgets, saveDashboardWidget } from "@/lib/dashboard-widget-store"
import { createDashboardPage, deleteDashboardPage, ensureDefaultDashboardPages, renameDashboardPage, resolveDashboardPage } from "@/lib/dashboard-pages"
import { logApiError } from "@/lib/api-error"
import { rejectStatelessSubscriptionRequest, STATELESS_MCP_CAPABILITIES } from "@/lib/mcp-stateless-transport"
import { createVirtualDatasetDefinition, getVirtualDatasetDefinition, listVirtualDatasetDefinitions, updateVirtualDatasetDefinition, VirtualDatasetConflictError, VirtualDatasetNotFoundError } from "@/lib/virtual-dataset-store"
import { activateDataMappingProfile, createDataMappingProfile, getDataMappingProfile, listDataMappingProfiles, updateDataMappingProfile, DataMappingProfileConflictError, DataMappingProfileNotFoundError } from "@/lib/data-mapping-store"
import { previewDataMappingProfile } from "@/lib/data-mapping-service"
import { activateDataRelationship, createDataRelationship, getDataRelationship, listDataRelationships, updateDataRelationship, DataRelationshipConflictError, DataRelationshipNotFoundError } from "@/lib/data-relationship-store"
import { previewDataRelationship } from "@/lib/data-relationship-service"
import { DataRelationshipExecutionError } from "@/lib/data-relationship-engine"

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
  if (error instanceof TypeError || error instanceof IngestBatchConflictError || error instanceof ReportDefinitionNotFoundError || error instanceof ReportDefinitionConflictError || error instanceof ReportDefinitionExecutionError || error instanceof VirtualDatasetNotFoundError || error instanceof VirtualDatasetConflictError || error instanceof DataMappingProfileNotFoundError || error instanceof DataMappingProfileConflictError || error instanceof DataRelationshipNotFoundError || error instanceof DataRelationshipConflictError || error instanceof DataRelationshipExecutionError) {
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
      description: "Read-only. Inspect the signed-in user's bounded active records, typed attributes, custom-field catalog, source files, datasets, saved virtual datasets, mapping profiles, relationships, supported source selectors, lifecycle status, review state, confidence, and provenance. Excluded records are omitted by default; request includeExcluded only when historical or removed rows are relevant. The response reports when the 40-record bound truncated results. Never invent fields, values, or identifiers not returned here.",
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

    server.registerTool("smart_storage.list_virtual_datasets", {
      title: "List saved Smart Storage virtual datasets",
      description: "Read-only. List reusable owned data selections. A virtual dataset stores source scope, filters, and projected fields—not copied rows—and resolves current data whenever a report or visual runs.",
      inputSchema: z.object({ search: z.string().max(120).optional() }),
    }, async ({ search }) => timedTool("smart_storage.list_virtual_datasets", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify({ virtualDatasets: await listVirtualDatasetDefinitions(userId, search) }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "list_virtual_datasets", "Saved virtual datasets could not be loaded.") }
    }))

    server.registerTool("smart_storage.get_virtual_dataset", {
      title: "Inspect a saved Smart Storage virtual dataset",
      description: "Read-only. Resolve one exact owned virtual-dataset slug and return its declarative source, filters, projected fields, and version. It never returns copied snapshot rows.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.get_virtual_dataset", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        return { content: [{ type: "text" as const, text: JSON.stringify({ virtualDataset: await getVirtualDatasetDefinition(userId, slug) }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "get_virtual_dataset", "The saved virtual dataset could not be loaded.") }
    }))

    server.registerTool("smart_storage.save_virtual_dataset", {
      title: "Save a reusable Smart Storage virtual dataset",
      description: "Create or version a declarative owned data selection for reuse by reports and dashboard visuals. Provide a records or dataset source, optional folder scope and filters, and 1–100 projected field names. Nested virtual datasets, SQL, formulas, and executable expressions are rejected.",
      inputSchema: z.object({
        definition: z.record(z.string(), z.unknown()),
        slug: z.string().min(1).max(80).optional(),
        expectedVersion: z.number().int().positive().optional(),
      }),
    }, async ({ definition, slug, expectedVersion }) => timedTool("smart_storage.save_virtual_dataset", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const saved = slug
          ? await updateVirtualDatasetDefinition(userId, slug, definition, expectedVersion ?? 0, "assistant")
          : await createVirtualDatasetDefinition(userId, definition, "assistant")
        return { content: [{ type: "text" as const, text: JSON.stringify({ virtualDataset: saved, useAs: { kind: "virtual_dataset", slug: saved.slug } }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "save_virtual_dataset", "The virtual dataset could not be saved.") }
    }))

    server.registerTool("smart_storage.list_mapping_profiles", {
      title: "List Smart Storage mapping profiles",
      description: "Read-only. List owned declarative field mappings and reconciliation contracts, including whether each exact version is draft, previewed, or active.",
      inputSchema: z.object({ search: z.string().max(120).optional() }),
    }, async ({ search }) => timedTool("smart_storage.list_mapping_profiles", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ mappingProfiles: await listDataMappingProfiles(userId, search) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "list_mapping_profiles", "Mapping profiles could not be loaded.") }
    }))

    server.registerTool("smart_storage.get_mapping_profile", {
      title: "Inspect a Smart Storage mapping profile",
      description: "Read-only. Return one exact owned profile, including its source, canonical mappings or custom typed reconciliation targets, missing/conflict policy, preview evidence, and activation state.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.get_mapping_profile", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ mappingProfile: await getDataMappingProfile(userId, slug) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "get_mapping_profile", "The mapping profile could not be loaded.") }
    }))

    server.registerTool("smart_storage.save_mapping_profile", {
      title: "Save a draft Smart Storage mapping profile",
      description: "Create or version a draft mapping profile. Legacy rules map one source field to a safe canonical field. Reconciliation rules declare a custom typed target, 1–10 ordered source candidates, required state, missing policy (null, exclude_row, exclude_dataset, reject), conflict policy, and optional time or currency role. Only allowlisted coercions are accepted. Rules cannot mix modes, execute expressions, activate themselves, or rewrite source records.",
      inputSchema: z.object({ definition: z.record(z.string(), z.unknown()), slug: z.string().min(1).max(80).optional(), expectedVersion: z.number().int().positive().optional() }),
    }, async ({ definition, slug, expectedVersion }) => timedTool("smart_storage.save_mapping_profile", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const saved = slug ? await updateDataMappingProfile(userId, slug, definition, expectedVersion ?? 0, "assistant") : await createDataMappingProfile(userId, definition, "assistant")
        return { content: [{ type: "text" as const, text: JSON.stringify({ mappingProfile: saved, next: "Preview this exact version before activation." }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "save_mapping_profile", "The mapping profile could not be saved.") }
    }))

    server.registerTool("smart_storage.preview_mapping_profile", {
      title: "Preview a Smart Storage mapping profile",
      description: "Analyze one exact owned draft against its bounded current source. Reconciliation previews load heterogeneous datasets before applying aliases and return included/excluded dataset outcomes, missing coverage, output rows, conflicts, type failures, and bounded samples. Samples are not persisted; only redacted counts and statuses mark the version as previewed.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.preview_mapping_profile", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ preview: await previewDataMappingProfile(userId, slug) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "preview_mapping_profile", "The mapping profile could not be previewed.") }
    }))

    server.registerTool("smart_storage.activate_mapping_profile", {
      title: "Activate a previewed Smart Storage mapping profile",
      description: "Explicitly activate the exact version most recently previewed. Reconciliation activation fails while required fields or default-reject conflicts remain unresolved. Activation enables runtime mapping for reports, dashboards, and virtual datasets; it never rewrites canonical records and never overrides existing canonical or user-corrected values.",
      inputSchema: z.object({ slug: z.string().min(1).max(80), expectedVersion: z.number().int().positive() }),
    }, async ({ slug, expectedVersion }) => timedTool("smart_storage.activate_mapping_profile", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ mappingProfile: await activateDataMappingProfile(userId, slug, expectedVersion), useAs: { kind: "mapping_profile", slug } }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "activate_mapping_profile", "The mapping profile could not be activated.") }
    }))

    server.registerTool("smart_storage.list_relationships", {
      title: "List Smart Storage data relationships",
      description: "Read-only. List owned equality relationships between virtual datasets and whether each exact version is draft, previewed, or active.",
      inputSchema: z.object({ search: z.string().max(120).optional() }),
    }, async ({ search }) => timedTool("smart_storage.list_relationships", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ relationships: await listDataRelationships(userId, search) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "list_relationships", "Data relationships could not be loaded.") }
    }))

    server.registerTool("smart_storage.get_relationship", {
      title: "Inspect a Smart Storage data relationship",
      description: "Read-only. Return one exact owned relationship, including its virtual dataset slugs, equality keys, declared cardinality, preview evidence, and activation state.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.get_relationship", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ relationship: await getDataRelationship(userId, slug) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "get_relationship", "The data relationship could not be loaded.") }
    }))

    server.registerTool("smart_storage.save_relationship", {
      title: "Save a draft Smart Storage data relationship",
      description: "Create or version an equality-only relationship between two different owned virtual datasets. Declare one_to_one, one_to_many, or many_to_one cardinality and named keys. Saving never activates the relationship; SQL, formulas, expressions, and many-to-many joins are rejected.",
      inputSchema: z.object({ definition: z.record(z.string(), z.unknown()), slug: z.string().min(1).max(80).optional(), expectedVersion: z.number().int().positive().optional() }),
    }, async ({ definition, slug, expectedVersion }) => timedTool("smart_storage.save_relationship", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const saved = slug ? await updateDataRelationship(userId, slug, definition, expectedVersion ?? 0, "assistant") : await createDataRelationship(userId, definition, "assistant")
        return { content: [{ type: "text" as const, text: JSON.stringify({ relationship: saved, next: "Preview this exact version before activation." }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "save_relationship", "The data relationship could not be saved.") }
    }))

    server.registerTool("smart_storage.preview_relationship", {
      title: "Preview a Smart Storage data relationship",
      description: "Evaluate the current bounded virtual datasets before activation. Reports null and unmatched keys, duplicates on each side, match rate, projected rows, cardinality validity, and expansion safety without persisting joined rows.",
      inputSchema: z.object({ slug: z.string().min(1).max(80) }),
    }, async ({ slug }) => timedTool("smart_storage.preview_relationship", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ preview: await previewDataRelationship(userId, slug) }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "preview_relationship", "The data relationship could not be previewed.") }
    }))

    server.registerTool("smart_storage.activate_relationship", {
      title: "Activate a previewed Smart Storage data relationship",
      description: "Activate only the exact previewed version after its current rows satisfy declared cardinality, produce at least one match, and remain within the 5,000-row limit. Runtime changes fail closed if those guarantees later stop holding.",
      inputSchema: z.object({ slug: z.string().min(1).max(80), expectedVersion: z.number().int().positive() }),
    }, async ({ slug, expectedVersion }) => timedTool("smart_storage.activate_relationship", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try { return { content: [{ type: "text" as const, text: JSON.stringify({ relationship: await activateDataRelationship(userId, slug, expectedVersion), useAs: { kind: "relationship", slug } }, null, 2) }] } }
      catch (error) { return mcpToolError(error, userId, "activate_relationship", "The data relationship could not be activated.") }
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
      inputSchema: z.object({ slug: z.string().min(1).max(80), period: z.object({ kind: z.enum(["all", "fixed", "rolling"]), from: z.string().optional(), to: z.string().optional(), unit: z.enum(["month", "year"]).optional(), count: z.number().int().optional(), offset: z.number().int().optional() }).optional() }),
    }, async ({ slug, period }) => timedTool("smart_storage.run_report_definition", async () => {
      const blocked = await toolGuard(userId, entitlement, "report")
      if (blocked) return blocked
      try {
        const definition = await getReportDefinition(userId, slug)
        let runtimePeriod
        if (period) {
          const checked = validateReportDefinitionPayload({ ...definition, period })
          if (!checked.ok) throw new ReportDefinitionExecutionError(checked.error)
          runtimePeriod = checked.value.period
        }
        const document = await runReportDefinition(userId, definition, new Date(), runtimePeriod)
        return { content: [{ type: "text" as const, text: JSON.stringify({ definition: { slug: definition.slug, version: definition.version }, document }, null, 2) }] }
      } catch (error) { return mcpToolError(error, userId, "run_report_definition", "The saved report could not be run.") }
    }))

    server.registerTool("smart_storage.save_report_definition", {
      title: "Save a refreshable Smart Storage report",
      description: "Create or update a report definition using only the declarative AVIntelligence contract. Never submit SQL, HTML, executable expressions, or computed snapshot rows. Inspect smart_storage.virtual_model first and use only returned fields and owned identifiers. Records may target up to 100 source.fileIds; datasets require exactly one datasetId, folderId, or fileIds selector; active mapping profiles and virtual datasets resolve by owned slug. Folder and file selection are evidence boundaries, and incompatible datasets are disclosed rather than coerced. To update, provide the exact slug and expectedVersion.",
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
      description: "Save a refreshable visual backed by canonical Smart Storage records, source datasets, an active mapping profile, or a saved virtual dataset and optionally plot it on a dashboard page. Inspect smart_storage.virtual_model first. The shared source contract supports intentional fileIds evidence boundaries as well as folder, dataset, mapping-profile, or virtual-dataset targeting. The definition is declarative: source, scope, period, filters, dimension, metric, and limit; SQL and executable expressions are never accepted.",
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
      "Tools include reusable virtual datasets, preview-gated canonical mappings, and preview-gated equality relationships between owned virtual datasets, plus saved reports and dashboard visuals that resolve those sources at run time. Relationship output fields are explicitly namespaced left_* and right_*; unmatched rows are disclosed, cardinality is enforced, and many-to-many joins are not supported. Read tools never modify data; save tools affect only the signed-in user's mappings, virtual datasets, relationships, reports, or dashboard.",
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
