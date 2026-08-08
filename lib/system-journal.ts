import { readFile } from "node:fs/promises"
import path from "node:path"

const GLOBAL_KEY = "global"

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim()
}

function sectionKeyFromHeading(heading: string): string {
  return heading.replace(/^#+\s*/, "").split("—")[0].split("-")[0].trim()
}

export function extractJournalSection(journal: string, toolKey: string | null | undefined): string {
  const matches = [...journal.matchAll(/^##\s+(.+)$/gm)]
  const sections = matches.map((match, index) => ({
    heading: match[1].trim(),
    key: sectionKeyFromHeading(match[1]),
    start: match.index ?? 0,
    end: matches[index + 1]?.index ?? journal.length,
  }))
  const normalizedTool = normalizeKey(toolKey ?? "")
  const selected = sections.find((section) => {
    const normalizedSection = normalizeKey(section.key)
    return normalizedTool && (normalizedSection === normalizedTool || normalizedSection.includes(normalizedTool) || normalizedTool.includes(normalizedSection))
  }) ?? sections.find((section) => normalizeKey(section.key) === GLOBAL_KEY)
  return selected ? journal.slice(selected.start, selected.end).trim() : "## GLOBAL\nNo system journal section is available."
}

export async function loadJournalSection(toolKey: string | null | undefined): Promise<string> {
  try {
    const journal = await readFile(path.join(process.cwd(), "docs", "System_Journal.md"), "utf8")
    return extractJournalSection(journal, toolKey)
  } catch {
    return "## GLOBAL\nSystem journal unavailable; use only the supplied error fields."
  }
}
