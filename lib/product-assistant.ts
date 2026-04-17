import { readFile } from "fs/promises"
import path from "path"

type KnowledgeSection = {
  title: string
  content: string
}

const KNOWLEDGE_PATH = path.join(process.cwd(), "docs", "product-assistant-knowledge.md")

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 2)
}

function extractListItems(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(- |\d+\.)/.test(line))
    .map((line) => line.replace(/^(- |\d+\.\s*)/, "").trim())
}

function extractLeadSentence(content: string) {
  const paragraphs = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^(- |\d+\.)/.test(line))

  return paragraphs[0] ?? ""
}

function sectionWeight(title: string, query: string) {
  const normalizedTitle = normalizeText(title)
  const normalizedQuery = normalizeText(query)

  if (normalizedQuery.includes("start") || normalizedQuery.includes("use") || normalizedQuery.includes("how do")) {
    if (normalizedTitle.includes("onboarding")) return 5
    if (normalizedTitle.includes("core product areas")) return 4
    if (normalizedTitle.includes("smart storage")) return 3
    if (normalizedTitle.includes("smart dashboard")) return 2
  }

  if (normalizedQuery.includes("processing") || normalizedQuery.includes("indicator")) {
    if (normalizedTitle.includes("processing indicator")) return 5
  }

  if (normalizedQuery.includes("report")) {
    if (normalizedTitle.includes("report availability")) return 5
  }

  if (normalizedQuery.includes("dashboard")) {
    if (normalizedTitle.includes("smart dashboard")) return 4
  }

  if (normalizedQuery.includes("improve") || normalizedQuery.includes("better") || normalizedQuery.includes("results")) {
    if (normalizedTitle.includes("usage coaching")) return 5
  }

  if (
    normalizedTitle.includes("purpose") ||
    normalizedTitle.includes("response style") ||
    normalizedTitle.includes("supported question types") ||
    normalizedTitle.includes("fallback behavior")
  ) {
    return -2
  }

  return 0
}

function parseKnowledgeSections(markdown: string): KnowledgeSection[] {
  const sections = markdown
    .split(/^##\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  return sections.map((section) => {
    const [rawTitle, ...rest] = section.split("\n")
    return {
      title: rawTitle.trim(),
      content: rest.join("\n").trim(),
    }
  })
}

export async function loadProductAssistantKnowledge() {
  const markdown = await readFile(KNOWLEDGE_PATH, "utf8")
  return {
    markdown,
    sections: parseKnowledgeSections(markdown),
  }
}

export async function findRelevantKnowledge(query: string, limit = 4) {
  const { sections } = await loadProductAssistantKnowledge()
  const queryTokens = tokenize(query)
  const scored = sections
    .map((section) => {
      const haystack = `${section.title} ${section.content}`
      const tokenScore = queryTokens.reduce((sum, token) => {
        return haystack.toLowerCase().includes(token) ? sum + 1 : sum
      }, 0)
      const titleScore = queryTokens.reduce((sum, token) => {
        return section.title.toLowerCase().includes(token) ? sum + 2 : sum
      }, 0)
      const score = tokenScore + titleScore + sectionWeight(section.title, query)
      return { ...section, score }
    })
    .filter((section) => section.score > 0)
    .sort((a, b) => b.score - a.score)

  return (scored.length ? scored : sections.slice(0, limit)).slice(0, limit)
}

export function buildKnowledgeContext(sections: KnowledgeSection[]) {
  return sections
    .map((section) => `## ${section.title}\n${section.content}`)
    .join("\n\n")
}

export function buildLocalAssistantFallback(question: string, sections: KnowledgeSection[]) {
  const primary = sections[0]
  const secondary = sections[1]

  const primaryLead = primary ? extractLeadSentence(primary.content) : ""
  const secondaryLead = secondary ? extractLeadSentence(secondary.content) : ""
  const bullets = sections
    .flatMap((section) => extractListItems(section.content))
    .filter(Boolean)
    .slice(0, 4)

  let answer = "The product guide is not available right now. Ask about Smart Storage, Smart Dashboard, reports, indicators, or what to do next."

  if (primary) {
    answer = primaryLead || primary.content.split("\n")[0] || answer

    if (secondaryLead) {
      answer = `${answer} ${secondaryLead}`
    }
  }

  return {
    answer,
    bullets,
    sources: sections.map((section) => section.title),
    question,
  }
}

export const PRODUCT_ASSISTANT_SYSTEM_PROMPT = `You are the AVIntelligence Product Assistant.

You help subscribed users understand how to use AVIntelligence more effectively.

You are a product guide, not a generic chatbot.

Your scope:
- onboarding help
- feature explanations
- UI guidance
- report guidance
- dashboard guidance
- workflow coaching
- next-step suggestions

You must not:
- provide tax advice
- provide legal advice
- provide accounting advice
- claim filing guarantees
- invent product behavior not grounded in the provided knowledge

Response style:
- concise
- practical
- product-grounded
- clear

Preferred structure:
1. direct answer
2. short explanation in product terms
3. one clear next step when helpful

If the answer is not supported by the provided knowledge, say so briefly and redirect the user toward supported product questions.`
