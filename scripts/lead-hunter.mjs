#!/usr/bin/env node
/**
 * AVIntelligence — Lead Hunter
 * Scans Reddit (live API) + Quora (via Google site search) for people
 * struggling with document chaos, expense tracking, and tax prep.
 * Drafts contextual replies via Claude.
 *
 * Run:  node scripts/lead-hunter.mjs
 * Flags: --reddit-only  --quora-only  --min-score=N
 * Requires: ANTHROPIC_API_KEY in .env.local
 */

import { readFileSync } from "fs"
import * as readline from "readline/promises"
import { stdin as input, stdout as output } from "process"

// ── Config ────────────────────────────────────────────────────────────────

const REDDIT_SUBS = [
  "selfemployed",
  "smallbusiness",
  "personalfinance",
  "Accounting",
  "tax",
  "Entrepreneur",
  "digitalnomad",
  "sidehustle",
  "Bookkeeping",
  "taxhelp",
]

const QUORA_SEARCH_QUERIES = [
  "how to organize receipts for taxes",
  "best way to track freelance expenses",
  "keep track of receipts small business",
  "freelance expense tracking system",
  "self employed record keeping taxes",
  "categorize expenses for Schedule C",
  "organize financial documents tax season",
  "receipt organization system small business",
  "how to prepare Schedule C expenses",
  "freelancer tax preparation documents",
  "best app to track business receipts",
  "automate expense categorization freelancer",
]

const PAIN_KEYWORDS = [
  // Document chaos
  "pile of receipts", "receipts everywhere", "stack of receipts",
  "organize receipts", "missing receipts", "lost receipts",
  "organize invoices", "pile of invoices", "scattered documents",
  "box of receipts", "shoebox", "bag of receipts",
  // Needing a report
  "need a p&l", "need a profit and loss", "generate p&l",
  "income and expense report", "expense report",
  "need to show my income", "prove my income",
  "send to my accountant", "accountant needs", "give to accountant",
  "organize for accountant", "bookkeeper",
  // Manual pain
  "manual entry", "manually entering", "entering receipts manually",
  "spreadsheet for expenses", "excel for expenses", "google sheets expenses",
  "hate spreadsheets", "spreadsheet nightmare", "track manually",
  // Expense categorization
  "categorize expenses", "categorizing receipts", "sort my expenses",
  "business vs personal", "separate business expenses",
  "what can i deduct", "deductible expenses", "track deductions",
  "schedule c", "schedule c expenses", "tax categories",
  // Alternatives
  "dext alternative", "dext too expensive", "autoentry alternative",
  "quickbooks alternative", "quickbooks too expensive",
  "cheaper than quickbooks", "affordable bookkeeping",
  "shoeboxed alternative", "neat alternative", "expensify alternative",
  // Receipt tracking
  "receipt tracker", "receipt app", "receipt scanner",
  "track receipts", "scan receipts", "photo receipts",
  "organize receipts", "store receipts", "keep receipts",
  // Freelance tax prep
  "freelance tax", "self employed tax", "1099 expenses",
  "tax prep freelance", "tax season receipts", "tax time organized",
]

const EXCLUDE_KEYWORDS = [
  "how long does it take", "wait time", "processing time",
  "when will i get my refund", "refund status",
  "tax rate", "tax bracket", "capital gains",
  "crypto tax", "nft tax", "stock tax",
  "inheritance", "estate tax", "property tax",
  "salary negotiation", "how much should i charge",
  "pregnant", "dog", "cat exam",
]

let MIN_SCORE = 6
const REDDIT_LIMIT = 30
const QUORA_RESULTS_PER_QUERY = 5

// ── Parse CLI flags ───────────────────────────────────────────────────────

const args = process.argv.slice(2)
const redditOnly = args.includes("--reddit-only")
const quoraOnly = args.includes("--quora-only")
const scoreFlag = args.find(a => a.startsWith("--min-score="))
if (scoreFlag) MIN_SCORE = parseInt(scoreFlag.split("=")[1]) || 6

// ── Load env ──────────────────────────────────────────────────────────────

function loadEnv() {
  try {
    const env = readFileSync(".env.local", "utf-8")
    for (const line of env.split("\n")) {
      const [key, ...rest] = line.split("=")
      if (key && rest.length) process.env[key.trim()] = rest.join("=").trim()
    }
  } catch {}
}
loadEnv()

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local")
  process.exit(1)
}

// ── Filtering ─────────────────────────────────────────────────────────────

function isRelevant(text) {
  const t = text.toLowerCase()
  if (EXCLUDE_KEYWORDS.some(kw => t.includes(kw))) return false
  return PAIN_KEYWORDS.some(kw => t.includes(kw))
}

// ── Reddit Fetcher ────────────────────────────────────────────────────────

async function fetchRedditSub(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${REDDIT_LIMIT}`
  const res = await fetch(url, {
    headers: { "User-Agent": "AVIntelligence-LeadHunter/2.0" },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data?.data?.children?.map(c => c.data) ?? [])
    .filter(p => isRelevant(`${p.title} ${p.selftext}`))
    .map(p => ({
      source:    "reddit",
      id:        `reddit-${p.id}`,
      title:     p.title,
      body:      p.selftext?.slice(0, 900) || "",
      community: `r/${p.subreddit}`,
      url:       `https://reddit.com${p.permalink}`,
      author:    p.author,
    }))
}

async function fetchAllReddit() {
  const results = []
  for (const sub of REDDIT_SUBS) {
    process.stdout.write(`  r/${sub}... `)
    try {
      const posts = await fetchRedditSub(sub)
      console.log(`${posts.length} matching`)
      results.push(...posts)
    } catch (e) {
      console.log(`error: ${e.message}`)
    }
    // Be nice to Reddit API
    await new Promise(r => setTimeout(r, 500))
  }
  return results
}

// ── Quora Fetcher (via Google site: search) ───────────────────────────────

async function searchQuoraGoogle(query) {
  const searchUrl = `https://www.google.com/search?q=site:quora.com+${encodeURIComponent(query)}&num=${QUORA_RESULTS_PER_QUERY}`
  try {
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })
    if (!res.ok) return []
    const html = await res.text()

    // Extract Quora URLs and titles from Google search results
    const results = []
    // Match patterns like <a href="/url?q=https://www.quora.com/..." or direct quora URLs
    const urlRegex = /https?:\/\/(?:www\.)?quora\.com\/[A-Za-z0-9_-]+(?:-[A-Za-z0-9_-]+)*/g
    const urls = [...new Set(html.match(urlRegex) ?? [])]

    // Extract titles from search result snippets
    // Google wraps titles in <h3> tags
    const titleRegex = /<h3[^>]*>(.*?)<\/h3>/gi
    const titles = []
    let m
    while ((m = titleRegex.exec(html)) !== null) {
      // Strip HTML tags from title
      titles.push(m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'))
    }

    for (let i = 0; i < urls.length && i < QUORA_RESULTS_PER_QUERY; i++) {
      const url = urls[i]
      // Skip profile pages, topic pages, etc.
      if (url.includes("/profile/") || url.includes("/topic/") || url.includes("/search")) continue

      // Derive title from URL slug if no Google title available
      const slug = url.split("/").pop() || ""
      const derivedTitle = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      const title = titles[i] || derivedTitle

      results.push({
        source:    "quora",
        id:        `quora-${slug}`,
        title:     title,
        body:      `Quora question found via Google search: "${query}"`,
        community: "Quora",
        url:       url,
        author:    "unknown",
      })
    }

    return results
  } catch (e) {
    return []
  }
}

async function fetchAllQuora() {
  const results = []
  const seenUrls = new Set()

  for (const query of QUORA_SEARCH_QUERIES) {
    process.stdout.write(`  "${query.slice(0, 45)}..."  `)
    try {
      const posts = await searchQuoraGoogle(query)
      const fresh = posts.filter(p => {
        if (seenUrls.has(p.url)) return false
        seenUrls.add(p.url)
        return true
      })
      console.log(`${fresh.length} new results`)
      results.push(...fresh)
    } catch (e) {
      console.log(`error: ${e.message}`)
    }
    // Don't hammer Google
    await new Promise(r => setTimeout(r, 2000))
  }
  return results
}

// ── Claude Scoring & Drafting ─────────────────────────────────────────────

async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ANTHROPIC_API_KEY,
      "anthropic-version":  "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

function getSystemPrompt(source) {
  const platformRules = source === "quora"
    ? `Reply rules for Quora:
- Write a genuinely helpful answer to the question FIRST (3-4 paragraphs of real advice)
- The answer must be useful even if the reader never clicks your link
- Mention your tool naturally at the end: "I actually built something for this exact problem"
- Link to the blog post (https://www.avintph.com/blog/why-smart-storage-beats-folders-financial-documents) NOT the product page
- 150-200 words total
- Don't start with "I"
- No exclamation marks
- No "great question" or sycophancy
- Sound like someone who's been through this problem personally`
    : `Reply rules for Reddit:
- Be honest that you're the founder who built this
- Name the specific report that solves their exact problem
- Tell them: upload the documents → AI reads them → report is generated, no manual entry
- Mention the free tier so they can try without committing
- Link to homepage: https://www.avintph.com
- 80-100 words max
- Don't start with "I"
- No exclamation marks
- No "great question" or sycophancy
- Sound like a person, not a product page`

  return `You are helping the solo founder of AVIntelligence find and respond to posts where people are struggling with financial document organization, expense tracking, or tax preparation.

AVIntelligence:
- Smart Storage: upload receipts, invoices, payslips, contracts → AI extracts every field automatically (no manual entry)
- Tax Bundle report: maps expenses to IRS Schedule C line items, flags duplicates, detects missing months, exports CSV
- Business Expense report: auto-classifies business vs personal, Schedule C mapping
- Also: P&L, Expense Summary, Income Summary, Contract Summary, Key Terms
- Free tier available. $6 day pass. $12/month Pro.
- Cheaper alternative to Dext ($40-50/mo), Shoeboxed ($18-36/mo), Neat ($200/yr)

Scoring (0-10):
- 9-10: Person has actual documents they need organized for tax filing / accountant
- 7-8: Freelancer/self-employed struggling to track or categorize expenses
- 5-6: Adjacent pain — bookkeeping frustration but no clear document problem
- 0-4: Tax law question, process question, unrelated topic

${platformRules}

Respond in exactly this format:
SCORE: [0-10]
REPORT: [which specific report(s) solve their problem]
REPLY:
[your drafted reply]`
}

async function scoreAndDraft(post) {
  const content = `Source: ${post.community}
Title: ${post.title}
Body: ${post.body || "(no body)"}
URL: ${post.url}`.trim()

  const response = await callClaude(getSystemPrompt(post.source), content)

  const scoreMatch  = response.match(/SCORE:\s*(\d+)/)
  const reportMatch = response.match(/REPORT:\s*(.+)/)
  const replyMatch  = response.match(/REPLY:\n([\s\S]+)/)

  return {
    score:  scoreMatch  ? parseInt(scoreMatch[1])  : 0,
    report: reportMatch ? reportMatch[1].trim()     : "—",
    reply:  replyMatch  ? replyMatch[1].trim()      : "",
  }
}

// ── Terminal UI ────────────────────────────────────────────────────────────

function separator() { console.log("\n" + "─".repeat(72) + "\n") }

const ICONS = { reddit: "📌", quora: "🟠" }

function printPost(post, score, report, reply, index, total) {
  separator()
  const icon = ICONS[post.source] || "📄"
  console.log(`${icon} ${post.community} [${index}/${total}] — Score: ${score}/10 — Report: ${report}`)
  console.log(`🔗 ${post.url}`)
  console.log(`\n📝 ${post.title}`)
  if (post.body && post.body.length > 30 && !post.body.startsWith("Quora question found")) {
    console.log(`\n${post.body.slice(0, 400)}${post.body.length > 400 ? "..." : ""}`)
  }
  console.log(`\n💬 Drafted reply:\n`)
  console.log(reply)
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 AVIntelligence — Lead Hunter v2")
  console.log(`Platforms: ${quoraOnly ? "Quora only" : redditOnly ? "Reddit only" : "Reddit + Quora"}`)
  console.log(`Min score: ${MIN_SCORE}\n`)

  let allPosts = []

  // Reddit
  if (!quoraOnly) {
    console.log("Reddit:")
    const redditPosts = await fetchAllReddit()
    allPosts.push(...redditPosts)
  }

  // Quora
  if (!redditOnly) {
    console.log("\nQuora (via Google):")
    const quoraPosts = await fetchAllQuora()
    allPosts.push(...quoraPosts)
  }

  // Deduplicate
  const seen = new Set()
  const unique = allPosts.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  if (!unique.length) {
    console.log("\nNo matching posts found right now. Try again later.")
    return
  }

  console.log(`\nScoring ${unique.length} posts with Claude...\n`)

  const scored = []
  for (const post of unique) {
    const label = post.source === "quora"
      ? `[Quora] ${post.title.slice(0, 50)}`
      : `[${post.community}] ${post.title.slice(0, 45)}`
    process.stdout.write(`  ${label}... `)
    try {
      const { score, report, reply } = await scoreAndDraft(post)
      process.stdout.write(`${score}/10\n`)
      if (score >= MIN_SCORE && reply) {
        scored.push({ post, score, report, reply })
      }
    } catch (e) {
      process.stdout.write(`error: ${e.message}\n`)
    }
  }

  scored.sort((a, b) => b.score - a.score)

  if (!scored.length) {
    console.log(`\nNo posts scored >= ${MIN_SCORE}. Try --min-score=5 or try again later.`)
    return
  }

  // Summary
  const redditCount = scored.filter(s => s.post.source === "reddit").length
  const quoraCount  = scored.filter(s => s.post.source === "quora").length
  console.log(`\n${scored.length} leads found (${redditCount} Reddit, ${quoraCount} Quora). Starting review...\n`)
  console.log("Controls: [a] approve & open  [e] edit reply  [s] skip  [q] quit\n")

  const rl = readline.createInterface({ input, output })
  const approved = []

  for (let i = 0; i < scored.length; i++) {
    let { post, score, report, reply } = scored[i]
    printPost(post, score, report, reply, i + 1, scored.length)

    let answer = ""
    while (!["a", "e", "s", "q"].includes(answer)) {
      answer = (await rl.question("\nAction [a/e/s/q]: ")).trim().toLowerCase()
    }

    if (answer === "q") break
    if (answer === "s") continue

    if (answer === "e") {
      console.log("\nEnter edited reply (type END on a new line when done):")
      const lines = []
      let line = ""
      while ((line = await rl.question("")) !== "END") lines.push(line)
      reply = lines.join("\n").trim()
      console.log(`\nUpdated:\n\n${reply}`)
      const ok = (await rl.question("\nApprove? [y/n]: ")).trim().toLowerCase()
      if (ok !== "y") continue
    }

    approved.push({ post, report, reply })
    console.log("\nApproved — opening in browser...\n")
    console.log("┌─ COPY THIS ──────────────────────────────────────────────┐")
    console.log(reply)
    console.log("└──────────────────────────────────────────────────────────┘")
    const { exec } = await import("child_process")
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
    exec(`${openCmd} "${post.url}"`)
    await rl.question("\nPress Enter once you've posted...")
  }

  rl.close()
  separator()
  console.log(`Done. ${approved.length} posted out of ${scored.length} reviewed.\n`)

  if (approved.length) {
    console.log("Session log:\n")
    approved.forEach(({ post, report, reply }, i) => {
      console.log(`[${i + 1}] ${post.community} — ${post.title.slice(0, 60)}`)
      console.log(`    Report pitched: ${report}`)
      console.log(`    ${post.url}\n`)
    })
  }
}

main().catch(e => {
  console.error("Fatal:", e.message)
  process.exit(1)
})
