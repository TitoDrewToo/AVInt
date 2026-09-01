// Read-only parity harness for the dashboard query consumers.
// Usage: node --env-file=.env.local --import tsx scripts/dashboard-parity.ts <user-id-or-email> <date-from> <date-to>

import { supabaseAdmin } from "@/lib/mcp-auth"

type Json = Record<string, unknown>
type Identity = { file_id: string; source_key: string }
type Identified<T> = { identity: Identity; occurredOn: string | null; value: T }

const [userInput, dateFrom, dateTo] = process.argv.slice(2)
if (!userInput || !dateFrom || !dateTo) {
  console.error("Usage: dashboard-parity <user-id-or-email> <date-from> <date-to>")
  process.exit(2)
}

async function resolveUserId(input: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) return input
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === input.toLowerCase())
    if (user) return user.id
    if (data.users.length < 1000) break
  }
  throw new Error(`No auth user found for ${input}`)
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function stringValue(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function fileValue(files: unknown, key: string) {
  const file = Array.isArray(files) ? files[0] : files
  return file && typeof file === "object" ? (file as Json)[key] ?? null : null
}

function sortRows<T>(rows: Array<Identified<T>>, descending = false) {
  return [...rows].sort((left, right) => {
    const dateCompare = (left.occurredOn ?? "").localeCompare(right.occurredOn ?? "")
    if (dateCompare !== 0) return descending ? -dateCompare : dateCompare
    const fileCompare = left.identity.file_id.localeCompare(right.identity.file_id)
    if (fileCompare !== 0) return fileCompare
    return left.identity.source_key.localeCompare(right.identity.source_key)
  })
}

function attributeMap(rows: Array<{ record_id: string; field_key: string; value: unknown; value_numeric?: unknown }>) {
  const result = new Map<string, Map<string, { value: unknown; value_numeric?: unknown }>>()
  for (const row of rows) {
    const fields = result.get(row.record_id) ?? new Map<string, { value: unknown; value_numeric?: unknown }>()
    fields.set(row.field_key, { value: row.value, value_numeric: row.value_numeric })
    result.set(row.record_id, fields)
  }
  return result
}

async function dashboardFields(userId: string, source: "document_fields" | "records") {
  if (source === "document_fields") {
    const { data, error } = await supabaseAdmin
      .from("document_fields")
      .select("file_id, source_key, document_date, total_amount, gross_income, net_income, expense_category, merchant_domain, currency, normalization_status, raw_json, vendor_normalized, merchant_address_region, is_recurring, line_items, files!inner(document_type, filename, user_id)")
      .eq("files.user_id", userId)
      .in("normalization_status", ["normalized", "manual"])
      .gte("document_date", dateFrom)
      .lte("document_date", dateTo)
    if (error) throw new Error(error.message)
    return sortRows((data ?? []).map((row) => ({
      identity: { file_id: row.file_id, source_key: row.source_key },
      occurredOn: row.document_date,
      value: {
        file_id: row.file_id,
        document_date: row.document_date,
        total_amount: row.total_amount,
        gross_income: row.gross_income,
        net_income: row.net_income,
        expense_category: row.expense_category,
        merchant_domain: row.merchant_domain,
        currency: row.currency,
        normalization_status: row.normalization_status,
        raw_json: row.raw_json,
        vendor_normalized: row.vendor_normalized,
        merchant_address_region: row.merchant_address_region,
        is_recurring: row.is_recurring,
        line_items: row.line_items,
        files: row.files,
      },
    })))
  }

  const { data: records, error } = await supabaseAdmin
    .from("records")
    .select("id, file_id, source_key, occurred_on, amount, currency, category, counterparty_normalized, is_recurring, confidence, parent_record_id, files!inner(document_type, filename, user_id)")
    .eq("user_id", userId)
    .is("parent_record_id", null)
    .is("excluded_at", null)
    .gte("occurred_on", dateFrom)
    .lte("occurred_on", dateTo)
  if (error) throw new Error(error.message)

  const allRecords = records ?? []
  const { data: children, error: childrenError } = allRecords.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("records").select("id, parent_record_id, source_key, amount").in("parent_record_id", allRecords.map((row) => row.id)).is("excluded_at", null).order("source_key", { ascending: true })
  if (childrenError) throw new Error(childrenError.message)
  const relatedIds = [...allRecords.map((row) => row.id), ...(children ?? []).map((row) => row.id)]
  const { data: attributes, error: attributesError } = relatedIds.length === 0
    ? { data: [], error: null }
    : await supabaseAdmin.from("record_attributes").select("record_id, field_key, value, value_numeric").in("record_id", relatedIds)
  if (attributesError) throw new Error(attributesError.message)
  const attrs = attributeMap(attributes ?? [])
  const childrenByParent = new Map<string, typeof children>()
  for (const child of children ?? []) childrenByParent.set(child.parent_record_id, [...(childrenByParent.get(child.parent_record_id) ?? []), child])

  return sortRows(allRecords.map((row) => {
    const fields = attrs.get(row.id) ?? new Map()
    const lineItems = (childrenByParent.get(row.id) ?? []).map((child) => ({
      ...Object.fromEntries(Array.from(attrs.get(child.id) ?? new Map()).filter(([key]) => key !== "line_items").map(([key, entry]) => [key, entry.value])),
      amount: child.amount,
      quantity: attrs.get(child.id)?.get("quantity")?.value ?? null,
    }))
    return {
      identity: { file_id: row.file_id, source_key: row.source_key },
      occurredOn: row.occurred_on,
      value: {
        file_id: row.file_id,
        document_date: row.occurred_on,
        total_amount: row.amount,
        gross_income: numberValue(fields.get("gross_income")?.value_numeric ?? fields.get("gross_income")?.value),
        net_income: numberValue(fields.get("net_income")?.value_numeric ?? fields.get("net_income")?.value),
        expense_category: row.category,
        merchant_domain: fields.get("merchant_domain")?.value ?? null,
        currency: row.currency,
        normalization_status: "normalized",
        raw_json: null,
        vendor_normalized: row.counterparty_normalized,
        merchant_address_region: fields.get("merchant_address_region")?.value ?? null,
        is_recurring: row.is_recurring,
        line_items: lineItems,
        files: row.files,
      },
    }
  }))
}

async function aiContext(userId: string, source: "document_fields" | "records") {
  const [{ data: files, error: filesError }, rows] = await Promise.all([
    supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", userId),
    dashboardFields(userId, source),
  ])
  if (filesError) throw new Error(filesError.message)
  const readyRows = rows.slice().sort((left, right) => {
    const dateCompare = (right.occurredOn ?? "").localeCompare(left.occurredOn ?? "")
    if (dateCompare !== 0) return dateCompare
    return `${left.identity.file_id}:${left.identity.source_key}`.localeCompare(`${right.identity.file_id}:${right.identity.source_key}`)
  })
  const typeCounts = new Map<string, number>()
  const currencyCounts = new Map<string, number>()
  for (const row of readyRows) {
    const type = stringValue(fileValue(row.value.files, "document_type")) ?? "general_document"
    typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)
    if (row.value.currency) currencyCounts.set(String(row.value.currency), (currencyCounts.get(String(row.value.currency)) ?? 0) + 1)
  }
  return {
    sourceCount: files?.length ?? 0,
    readyRecordCount: readyRows.length,
    attentionCount: (files ?? []).filter((file) => ["processing", "pending_scan", "scanning", "approved"].includes(file.upload_status)).length,
    documentTypes: Object.fromEntries(typeCounts),
    currencies: Object.fromEntries(currencyCounts),
    recentRecords: readyRows.slice(0, 40).map((row) => ({
      date: row.value.document_date,
      vendor: row.value.vendor_normalized ?? null,
      type: stringValue(fileValue(row.value.files, "document_type")) ?? "general_document",
      amount: row.value.total_amount ?? row.value.gross_income ?? row.value.net_income ?? null,
      currency: row.value.currency ?? null,
      category: row.value.expense_category ?? null,
      merchantDomain: row.value.merchant_domain ?? null,
    })),
  }
}

function diff(left: unknown, right: unknown, path = "") : string[] {
  if (Object.is(left, right)) return []
  if (Array.isArray(left) && Array.isArray(right)) {
    const differences: string[] = []
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index += 1) differences.push(...diff(left[index], right[index], `${path}[${index}]`))
    return differences
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = new Set([...Object.keys(left as Json), ...Object.keys(right as Json)])
    return [...keys].flatMap((key) => diff((left as Json)[key], (right as Json)[key], path ? `${path}.${key}` : key))
  }
  return [`${path}: ${JSON.stringify(left)} vs ${JSON.stringify(right)}`]
}

function withoutRawJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRawJson)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Json)
      .filter(([key]) => key !== "raw_json")
      .map(([key, entry]) => [key, withoutRawJson(entry)]))
  }
  return value
}

const ACCEPTED_LINE_ITEM_NULL_KEYS = new Set(["due_date", "check_number", "bank_name", "unit_quantity"])

function withoutAcceptedLineItemNullKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAcceptedLineItemNullKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Json)
      // These keys are null in every production row and are unread by every
      // dashboard consumer; records correctly omit null-only attributes.
      .filter(([key, entry]) => !ACCEPTED_LINE_ITEM_NULL_KEYS.has(key) || entry != null)
      .map(([key, entry]) => [key, withoutAcceptedLineItemNullKeys(entry)]))
  }
  return value
}

// Accepted by the already-shipped payslip gross-income correction: the
// records path intentionally reports gross while legacy document_fields holds
// net for these two rows.
const ACCEPTED_PAYSLIP_GROSS_DELTA = new Set([
  "fetchDashboardReadyFields[e6ee18af-aaca-4eca-b6e2-0a6ca1cf4403:root].total_amount: 26700 vs 29500",
  "fetchDashboardReadyFields[b8632083-2f29-4b66-aa44-f2d533afc7fc:root].total_amount: 46325 vs 53500",
  "fetchDashboardReadyFields[37eb9a53-86bf-4dea-905e-91153666b97f:root].total_amount: null vs 48500",
  "buildDashboardAIContext.recentRecords[0].amount: 46325 vs 53500",
  "buildDashboardAIContext.recentRecords[12].amount: 26700 vs 29500",
])

const ACCEPTED_DELTA_REASONS = [
  "raw_json -> null: mandated by the brief and unread by dashboard consumers",
  "payslip gross corrections: shipped in b8db821; records report gross while legacy holds net",
  "line_items null-valued keys omitted: all four keys are null-only in production and unread by dashboard consumers",
] as const

function compareIdentified<T>(label: string, legacy: Array<Identified<T>>, records: Array<Identified<T>>) {
  const legacyById = new Map(legacy.map((row) => [`${row.identity.file_id}:${row.identity.source_key}`, row]))
  const recordsById = new Map(records.map((row) => [`${row.identity.file_id}:${row.identity.source_key}`, row]))
  const differences: string[] = []
  for (const key of legacyById.keys()) if (!recordsById.has(key)) differences.push(`${label} unmatched records row ${key}`)
  for (const key of recordsById.keys()) if (!legacyById.has(key)) differences.push(`${label} unmatched legacy row ${key}`)
  for (const key of legacyById.keys()) {
    const oldRow = legacyById.get(key)
    const newRow = recordsById.get(key)
    if (oldRow && newRow) differences.push(...diff(withoutAcceptedLineItemNullKeys(withoutRawJson(oldRow.value)), withoutAcceptedLineItemNullKeys(withoutRawJson(newRow.value)), `${label}[${key}]`))
  }
  return differences
}

async function main() {
  const userId = await resolveUserId(userInput)
  const [legacyFields, recordFields, legacyAI, recordAI] = await Promise.all([
    dashboardFields(userId, "document_fields"),
    dashboardFields(userId, "records"),
    aiContext(userId, "document_fields"),
    aiContext(userId, "records"),
  ])
  const allDifferences = [
    ...compareIdentified("fetchDashboardReadyFields", legacyFields, recordFields),
    ...diff(withoutAcceptedLineItemNullKeys(withoutRawJson(legacyAI)), withoutAcceptedLineItemNullKeys(withoutRawJson(recordAI)), "buildDashboardAIContext"),
  ]
  const acceptedDifferences = allDifferences.filter((difference) => ACCEPTED_PAYSLIP_GROSS_DELTA.has(difference))
  const differences = allDifferences.filter((difference) => !acceptedDifferences.includes(difference))
  console.log(JSON.stringify({ userId, fetchDashboardReadyFields: { legacyRows: legacyFields.length, recordRows: recordFields.length }, buildDashboardAIContext: { legacyRecentRows: legacyAI.recentRecords.length, recordRecentRows: recordAI.recentRecords.length }, acceptedDeltaReasons: ACCEPTED_DELTA_REASONS, acceptedDifferences, diffCount: differences.length, differences }, null, 2))
  if (differences.length > 0) process.exitCode = 1
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
