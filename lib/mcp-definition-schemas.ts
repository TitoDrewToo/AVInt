import { z } from "zod"

const field = z.string().regex(/^[a-z][a-z0-9_]{0,199}$/)
const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/)
const title = z.string().min(1).max(120)
const description = z.string().max(500).nullable().optional()
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
const selectors = { dateField: field.optional(), currencyField: field.optional() }
export const materializedSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("records"), documentTypes: z.array(z.string()).max(20).optional(), fileIds: z.array(z.string().uuid()).min(1).max(100).optional() }).strict(),
  z.object({ kind: z.literal("dataset"), datasetId: z.string().uuid().optional(), folderId: z.string().uuid().optional(), fileIds: z.array(z.string().uuid()).min(1).max(100).optional(), ...selectors }).strict().describe("Specify exactly one of datasetId, folderId or fileIds; a period requires dateField."),
])
const mappingSource = z.object({ kind: z.literal("mapping_profile"), slug }).strict()
export const reportSourceSchema = z.union([materializedSourceSchema, mappingSource, z.object({ kind: z.literal("virtual_dataset"), slug, ...selectors }).strict(), z.object({ kind: z.literal("relationship"), slug }).strict()])
const scope = z.object({ folderId: z.string().uuid().nullable().optional() }).strict().nullable().optional()
const filters = z.array(z.object({ field, operator: z.enum(["eq", "neq", "contains", "gt", "gte", "lt", "lte"]), value: scalar }).strict()).optional()
const period = z.discriminatedUnion("kind", [z.object({ kind: z.literal("all") }).strict(), z.object({ kind: z.literal("fixed"), from: z.string(), to: z.string() }).strict(), z.object({ kind: z.literal("rolling"), unit: z.enum(["month", "year"]), count: z.number().int().positive(), offset: z.number().int().optional() }).strict()])
const metric = z.object({ aggregation: z.enum(["count", "count_distinct", "sum", "average", "min", "max", "ratio"]), field: field.optional(), numerator: field.optional(), denominator: field.optional(), onZero: z.enum(["suppress", "null"]).optional() }).strict().describe("ratio uses numerator and denominator fields; count may omit field. Other aggregations require field.")
const items = z.array(z.object({ label: z.string().min(1).max(80), metric }).strict()).min(1).max(8)
const block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("kpi"), items }).strict(),
  z.object({ type: z.literal("stat"), title, metric }).strict(),
  z.object({ type: z.literal("share"), title, groupBy: field, metric, limit: z.number().int().min(1).max(50).optional() }).strict(),
  z.object({ type: z.literal("table"), title, columns: z.array(z.object({ field, label: z.string().optional() }).strict()).min(1), sort: z.object({ field, direction: z.enum(["asc", "desc"]) }).strict().optional(), limit: z.number().int().min(1).max(500).optional() }).strict(),
  z.object({ type: z.literal("series"), title, timeField: field, bucket: z.enum(["day", "week", "month", "quarter"]), metric, splitBy: field.optional(), limit: z.number().int().min(1).max(20).optional().describe("Maximum split groups, NOT time buckets. The date period determines the time axis."), emptyBucket: z.enum(["gap", "zero"]).optional().describe("What an empty time bucket means; defaults to zero for counts and gap for numeric aggregates.") }).strict(),
  z.object({ type: z.literal("comparison"), title, against: z.literal("previous_period"), items }).strict(),
  z.object({ type: z.literal("narrative"), title, text: z.string() }).strict(),
  z.object({ type: z.literal("note"), text: z.string() }).strict(),
])
export const reportDefinitionSchema = z.object({ title, description, source: reportSourceSchema, scope, period, filters, blocks: z.array(block).min(1), theme: z.object({ accent: z.string().optional(), density: z.enum(["compact", "comfortable"]).optional(), client: z.object({ name: z.string().optional(), logoUrl: z.string().optional() }).strict().optional(), footer: z.string().optional() }).strict().nullable().optional() }).strict()
export const virtualDatasetSchema = z.object({ title, description, source: z.union([materializedSourceSchema, mappingSource]), scope, filters, fields: z.array(field).min(1).max(100), slug: slug.optional().describe("Optional exact handle on creation. Omit for a title-derived handle.") }).strict()
const sideField = z.object({ side: z.enum(["left", "right"]), field }).strict()
export const relationshipSchema = z.object({ title, description, leftVirtualDatasetSlug: slug, rightVirtualDatasetSlug: slug, leftKey: field, rightKey: field, cardinality: z.enum(["one_to_one", "one_to_many", "many_to_one"]), dateField: sideField.optional(), currencyField: sideField.optional() }).strict()
const coercion = z.enum(["identity", "trim", "number", "date", "boolean", "lowercase", "uppercase", "direction"])
export const mappingProfileSchema = z.object({ title, description, source: materializedSourceSchema, scope, mappings: z.array(z.union([
  z.object({ sourceField: field, targetField: field, coercion }).strict(),
  z.object({ targetField: field, targetType: z.enum(["text", "number", "date", "boolean"]), candidates: z.array(z.object({ sourceField: field, coercion }).strict()).min(1).max(10), required: z.boolean(), onMissing: z.enum(["null", "exclude_row", "exclude_dataset", "reject"]), onConflict: z.enum(["reject", "first_non_empty"]), role: z.enum(["time", "currency"]).optional() }).strict(),
])).min(1).max(50) }).strict()
