import { readFile } from "node:fs/promises"
import path from "node:path"

export const JOURNAL_CHAR_BUDGET = 20_000
export type TimeWindow = "day" | "week" | "month" | "all"
export type TopicScope = "narrow" | "related" | "full"
export type JournalError = { occurred_at?: string | null; tool?: string | null; fn?: string | null; route?: string | null; severity?: string | null; [key: string]: unknown }
export type JournalGroup = { first_seen?: string | null; last_seen?: string | null; diagnosed_at?: string | null; severity?: string | null; [key: string]: unknown }
export type JournalContext = { text: string; timeWindow: TimeWindow; topicScope: TopicScope }
type Section = { heading: string; key: string; text: string }
type TimelineEntry = { date: string; timestamp: number; text: string }

function normalize(value: unknown) { return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "") }
function keyOf(heading: string) { return heading.replace(/^#+\s*/, "").split("—")[0].split("-")[0].trim() }
function sections(journal: string): Section[] {
  const matches = [...journal.matchAll(/^##\s+(.+)$/gm)]
  return matches.map((match, index) => ({ heading: match[1].trim(), key: keyOf(match[1]), text: journal.slice(match.index ?? 0, matches[index + 1]?.index ?? journal.length).trim() }))
}
function timelineEntries(journal: string): TimelineEntry[] {
  const section = sections(journal).find((item) => normalize(item.heading) === "timeline")
  if (!section) return []
  return [...section.text.matchAll(/^[-*]\s+(\d{4}-\d{2}-\d{2})\s+·\s+(.+)$/gm)]
    .map((match) => ({ date: match[1], timestamp: Date.parse(match[1] + "T00:00:00Z"), text: "- " + match[1] + " · " + match[2].trim() }))
    .filter((item) => Number.isFinite(item.timestamp))
}
function dateOf(value: unknown) { const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN; return Number.isFinite(parsed) ? parsed : null }
function words(value: unknown) { return normalize(value).match(/[a-z]{4,}/g) ?? [] }
function matchesTool(section: Section, tool: unknown) {
  const sectionKey = normalize(section.key), source = normalize(tool)
  if (!source || !sectionKey) return false
  if (sectionKey === source || sectionKey.includes(source) || source.includes(sectionKey)) return true
  const aliases: Record<string, string[]> = { reportstax: ["reports"], taxbundle: ["reports"], smartstorage: ["smartstorage"], prescandocument: ["prescan"] }
  return (aliases[source] ?? []).some((alias) => sectionKey === alias || sectionKey.includes(alias))
}
function isRelated(section: Section, error: JournalError) {
  if (normalize(section.key) === "global") return true
  const values = [error.tool, error.fn, error.route].flatMap(words), keys = words(section.key)
  return values.some((value) => keys.some((key) => value.includes(key) || key.includes(value)))
}
function chooseTime(error: JournalError, group: JournalGroup, timeline: TimelineEntry[], force: boolean): TimeWindow {
  if (force || group.diagnosed_at) return "all"
  const tool = normalize(error.tool)
  const crossSubsystem = Boolean(tool && [error.fn, error.route].filter(Boolean).map(normalize).some((value) => value && !value.includes(tool) && !tool.includes(value)))
  if (normalize(error.severity ?? group.severity) === "high" && crossSubsystem) return "all"
  const anchor = dateOf(error.occurred_at) ?? dateOf(group.last_seen) ?? Date.now()
  const first = dateOf(group.first_seen)
  if (first !== null && anchor - first > 30 * 86400000) return "all"
  const newest = timeline[0]?.timestamp
  if (!newest) return "all"
  const delta = anchor - newest
  if (delta >= 0 && delta <= 6 * 3600000) return "day"
  if (delta < 0 || delta > 7 * 86400000) return "all"
  return "week"
}
function chooseTopic(error: JournalError, group: JournalGroup): TopicScope {
  const tool = normalize(error.tool), severity = normalize(error.severity ?? group.severity)
  const sensitive = new Set(["billing", "auth", "reportstax", "prescan", "systems", "sales"])
  const values = [error.fn, error.route].filter(Boolean).map(normalize)
  const crossSubsystem = Boolean(tool && values.some((value) => value && !value.includes(tool) && !tool.includes(value)))
  if (crossSubsystem) return "full"
  if (severity === "high" || sensitive.has(tool)) return "related"
  return "narrow"
}
function cutoff(window: TimeWindow, anchor: number) { return window === "day" ? anchor - 86400000 : window === "week" ? anchor - 7 * 86400000 : window === "month" ? anchor - 30 * 86400000 : Number.NEGATIVE_INFINITY }
function bounded(parts: string[]) { const value = parts.filter(Boolean).join("\n\n"); return value.length <= JOURNAL_CHAR_BUDGET ? value : value.slice(0, JOURNAL_CHAR_BUDGET) }

export function selectJournalContext(error: JournalError, group: JournalGroup = {}, journal: string, force = false, overrides?: Partial<JournalContext>): JournalContext {
  const evergreen = sections(journal).filter((section) => !["timeline", "changelog", "changelogrecentmaterialchanges"].includes(normalize(section.heading)))
  const timeline = timelineEntries(journal)
  const timeWindow = overrides?.timeWindow ?? chooseTime(error, group, timeline, force)
  const topicScope = overrides?.topicScope ?? chooseTopic(error, group)
  const matched = evergreen.find((section) => matchesTool(section, error.tool)) ?? evergreen.find((section) => normalize(section.key) === "global")
  const selected = topicScope === "narrow" ? (matched ? [matched] : []) : topicScope === "related" ? evergreen.filter((section) => isRelated(section, error)) : evergreen
  const anchor = dateOf(error.occurred_at) ?? dateOf(group.last_seen) ?? Date.now()
  const timelineText = timeline.filter((entry) => entry.timestamp >= cutoff(timeWindow, anchor) && entry.timestamp <= anchor + 86400000).map((entry) => entry.text)
  return { text: bounded([...selected.map((section) => section.text), timelineText.length ? "## TIMELINE\n" + timelineText.join("\n") : ""]), timeWindow, topicScope }
}
export async function loadSystemJournal() {
  try { return await readFile(path.join(process.cwd(), "docs", "System_Journal.md"), "utf8") }
  catch { return "## GLOBAL\nSystem journal unavailable; use only the supplied error fields." }
}
export async function loadJournalSection(toolKey: string | null | undefined) {
  return selectJournalContext({ tool: toolKey }, {}, await loadSystemJournal()).text
}
export function nextTimeWindow(value: TimeWindow): TimeWindow { return value === "day" ? "week" : value === "week" ? "month" : "all" }
export function nextTopicScope(value: TopicScope): TopicScope { return value === "narrow" ? "related" : "full" }
export function shouldEscalateDiagnosis(result: { confidence?: unknown; needs_more?: { time?: unknown; topic?: unknown } | null }) {
  return (typeof result.confidence !== "number" || result.confidence < 0.5) || Boolean(result.needs_more?.time || result.needs_more?.topic)
}
