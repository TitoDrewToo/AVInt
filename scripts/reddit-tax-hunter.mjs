#!/usr/bin/env node
/**
 * AVIntelligence — Document Chaos Hunter
 * Hunts Reddit (+ optionally Twitter/X) for people who need what the
 * AVIntelligence report generator solves: scattered documents → structured
 * financial output, instantly, without manual entry or a bookkeeper.
 *
 * Run:  node scripts/reddit-tax-hunter.mjs
 * Requires: ANTHROPIC_API_KEY in .env.local
 * Optional: TWITTER_BEARER_TOKEN in .env.local (Twitter Basic tier, $100/mo)
 */

import { readFileSync } from "fs"
import * as readline from "readline/promises"
import { stdin as input, stdout as output } from "process"

// ── Config ─────────────────────────────────────────────────────────────────

const REDDIT_SUBS = [
  "freelance",
  "selfemployed",
  "smallbusiness",
  "personalfinance",
  "Accounting",
  "tax",
  "Philippines",
  "phcareers",
  "Entrepreneur",
  "digitalnomad",
]

// The specific pain: document chaos → needing structured financial output
// NOT: tax law, wait times, audit procedures, salary questions
const PAIN_KEYWORDS = [
  // Document chaos
  "pile of receipts", "receipts everywhere", "stack of receipts",
  "organize receipts", "missing receipts", "lost receipts",
  "organize invoices", "pile of invoices", "scattered documents",
  "box of receipts", "shoebox", "bag of receipts",

  // Needing a report but don't have one
  "need a p&l", "need a profit and loss", "generate p&l",
  "income and expense report", "expense report",
  "need to show my income", "prove my income",
  "send to my accountant", "accountant needs", "give to accountant",
  "organize for accountant", "bookkeeper",

  // Manual pain / spreadsheet hell
  "manual entry", "manually entering", "entering receipts manually",
  "spreadsheet for expenses", "excel for expenses", "google sheets expenses",
  "hate spreadsheets", "spreadsheet nightmare", "track manually",

  // Income tracking
  "total income across", "income from multiple", "multiple clients income",
  "how much did i earn", "track freelance income", "freelance income tracker",
  "don't know what i earned", "can't figure out my income",

  // Expense categorization
  "categorize expenses", "categorizing receipts", "sort my expenses",
  "business vs personal", "separate business expenses",
  "what can i deduct", "deductible expenses", "track deductions",
  "don't know what i spent", "can't track expenses",

  // Alternatives to expensive tools
  "dext alternative", "dext too expensive", "autoentry alternative",
  "quickbooks alternative", "quickbooks too expensive",
  "wave accounting", "cheaper than quickbooks", "affordable bookkeeping",

  // Taxable income / filing prep (document-specific, not process)
  "taxable income", "estimate what i owe", "compute my tax",
  "1099 income", "freelance tax", "self employed tax",
  "itr filing documents", "bir requirements", "bir form 1701",
]

// Exclude — these are out of scope even if keywords match
const EXCLUDE_KEYWORDS = [
  "how long does it take", "wait time", "processing time",
  "when will i get my refund", "refund status",
  "tax rate", "tax bracket", "capital gains",
  "crypto tax", "nft tax", "stock tax",
  "inheritance", "estate tax", "property tax",
  "salary negotiation", "how much should i charge",
]

const TWITTER_QUERIES = [
  '"receipts everywhere" OR "pile of receipts" OR "organize receipts" freelance',
  '"need a P&L" OR "profit and loss" freelancer self-employed',
  '"send to accountant" OR "accountant needs" receipts invoices',
  '"manual entry" OR "manually entering" receipts expenses bookkeeping',
  '"dext alternative" OR "quickbooks too expensive" OR "autoentry"',
  '"track my expenses" OR "categorize expenses" freelance -crypto',
  '"income from multiple clients" OR "multiple 1099" OR "freelance income"',
]

const MIN_SCORE     = 7
const REDDIT_LIMIT  = 30   // posts per subreddit
const TWITTER_LIMIT = 20   // tweets per query

// ── Load env ────────────────────────────────────────────────────────────────

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

const ANTHROPIC_API_KEY    = process.env.ANTHROPIC_API_KEY
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN

if (!ANTHROPIC_API_KEY) {
  console.error("❌ ANTHROPIC_API_KEY not found in .env.local")
  process.exit(1)
}

// ── Filtering ───────────────────────────────────────────────────────────────

function isRelevant(text) {
  const t = text.toLowerCase()
  const excluded = EXCLUDE_KEYWORDS.some((kw) => t.includes(kw))
  if (excluded) return false
  return PAIN_KEYWORDS.some((kw) => t.includes(kw))
}

// ── Reddit ──────────────────────────────────────────────────────────────────

async function fetchRedditSub(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${REDDIT_LIMIT}`
  const res = await fetch(url, {
    headers: { "User-Agent": "AVIntelligence-Scout/1.0" },
  })
  if (!res.ok) return []
  const data = await res.json()
  return (data?.data?.children?.map((c) => c.data) ?? [])
    .filter((p) => isRelevant(`${p.title} ${p.selftext}`))
    .map((p) => ({
      source:     "reddit",
      id:         `reddit-${p.id}`,
      title:      p.title,
      body:       p.selftext?.slice(0, 900) || "",
      subreddit:  p.subreddit,
      url:        `https://reddit.com${p.permalink}`,
      author:     p.author,
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
  }
  return results
}

// ── Twitter/X ───────────────────────────────────────────────────────────────

async function fetchTwitterQuery(query) {
  const params = new URLSearchParams({
    query:        `${query} -is:retweet lang:en`,
    max_results:  String(TWITTER_LIMIT),
    "tweet.fields": "author_id,created_at,text",
    expansions:   "author_id",
    "user.fields": "username",
  })
  const res = await fetch(`https://api.twitter.com/2/tweets/search/recent?${params}`, {
    headers: { Authorization: `Bearer ${TWITTER_BEARER_TOKEN}` },
  })
  if (!res.ok) return []
  const data = await res.json()
  const users = Object.fromEntries(
    (data.includes?.users ?? []).map((u) => [u.id, u.username])
  )
  return (data.data ?? [])
    .filter((t) => isRelevant(t.text))
    .map((t) => ({
      source:    "twitter",
      id:        `twitter-${t.id}`,
      title:     t.text.slice(0, 100),
      body:      t.text,
      subreddit: null,
      url:       `https://twitter.com/${users[t.author_id] ?? "i"}/status/${t.id}`,
      author:    users[t.author_id] ?? "unknown",
    }))
}

async function fetchAllTwitter() {
  if (!TWITTER_BEARER_TOKEN) {
    console.log("  ⚠️  No TWITTER_BEARER_TOKEN — skipping Twitter")
    return []
  }
  const results = []
  for (const q of TWITTER_QUERIES) {
    process.stdout.write(`  "${q.slice(0, 50)}..."  `)
    try {
      const tweets = await fetchTwitterQuery(q)
      console.log(`${tweets.length} matching`)
      results.push(...tweets)
      // Respect rate limits
      await new Promise((r) => setTimeout(r, 1200))
    } catch (e) {
      console.log(`error: ${e.message}`)
    }
  }
  return results
}

// ── Claude ──────────────────────────────────────────────────────────────────

async function callClaude(system, user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "x-api-key":       ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    }),
  })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

const SYSTEM_PROMPT = `You are helping the solo founder of AVIntelligence find posts where people are suffering from a very specific problem: they have financial documents (receipts, invoices, payslips, contracts) scattered or disorganized, and they need structured financial output — a report, a P&L, an expense summary, proof of income — but they don't want to do it manually or pay for expensive bookkeeping software.

AVIntelligence solves this exactly:
- Smart Storage: upload receipts, invoices, payslips, contracts → AI reads every document and extracts all fields automatically (no manual entry)
- Reports generated instantly from uploaded documents:
  • P&L Report — revenue vs expenses, net position, monthly breakdown
  • Tax Bundle — gross income, deductible expenses, estimated taxable income, withholding credited
  • Expense Summary — by category, by vendor, transaction detail
  • Income Summary — by employer/client, withholding per source
  • Business Expense — business vs personal split
  • Contract Summary — payment schedules, obligations tracking
- Free tier to try. $6 day pass (full access, 24 hours). $12/month.
- Alternative to Dext ($40-50/mo), AutoEntry, manual spreadsheets.
- Website: https://avintph.com

Scoring (0-10) — score HIGH when:
- 9-10: Person has actual documents (receipts, invoices, payslips) they need to turn into a report or organized output, and they're doing it manually, not doing it at all, or paying too much
- 7-8: Freelancer/self-employed struggling to track income or expenses across multiple sources
- 5-6: Adjacent pain — bookkeeping frustration but no clear document pile mentioned
- 0-4: Tax law question, wait times, salary questions, crypto, no document chaos

Reply rules:
- You are the founder who built this — be honest about it
- Name the specific report that solves their exact problem (P&L, Tax Bundle, Expense Summary, etc.)
- Tell them: upload the documents → AI reads them → report is generated, no manual entry
- Mention the $6 day pass so they can try it without committing
- 80 words max
- Don't start with "I"
- No exclamation marks
- No "great question" or sycophancy
- Sound like a person, not a product page

Respond in exactly this format:
SCORE: [0-10]
REPORT: [which specific report(s) solve their problem]
REPLY:
[your drafted reply]`

async function scoreAndDraft(post) {
  const content = `Source: ${post.source === "twitter" ? "Twitter/X" : `r/${post.subreddit}`}
Title: ${post.title}
Body: ${post.body || "(no body — tweet or short post)"}`.trim()

  const response = await callClaude(SYSTEM_PROMPT, content)

  const scoreMatch  = response.match(/SCORE:\s*(\d+)/)
  const reportMatch = response.match(/REPORT:\s*(.+)/)
  const replyMatch  = response.match(/REPLY:\n([\s\S]+)/)

  return {
    score:  scoreMatch  ? parseInt(scoreMatch[1])  : 0,
    report: reportMatch ? reportMatch[1].trim()     : "—",
    reply:  replyMatch  ? replyMatch[1].trim()      : "",
  }
}

// ── Terminal UI ─────────────────────────────────────────────────────────────

function separator() { console.log("\n" + "─".repeat(72) + "\n") }

function printPost(post, score, report, reply, index, total) {
  separator()
  const src = post.source === "twitter"
    ? `🐦 Twitter/X`
    : `📌 r/${post.subreddit}`
  console.log(`${src} [${index}/${total}] — Score: ${score}/10 — Report: ${report}`)
  console.log(`🔗 ${post.url}`)
  console.log(`\n📝 ${post.title}`)
  if (post.body && post.body !== post.title) {
    console.log(`\n${post.body.slice(0, 400)}${post.body.length > 400 ? "..." : ""}`)
  }
  const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
  console.log(`\n💬 Drafted reply:\n`)
  console.log(finalReply)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 AVIntelligence — Document Chaos Hunter")
  console.log("Hunting for: scattered docs → needing a financial report\n")

  // Fetch
  console.log("Reddit:")
  const redditPosts = await fetchAllReddit()

  console.log("\nTwitter/X:")
  const twitterPosts = await fetchAllTwitter()

  const allPosts = [...redditPosts, ...twitterPosts]

  // Deduplicate
  const seen = new Set()
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  if (!unique.length) {
    console.log("\n✅ No matching posts found right now. Try again later.")
    return
  }

  console.log(`\n⚡ Scoring ${unique.length} posts with Claude...\n`)

  const scored = []
  for (const post of unique) {
    const label = post.source === "twitter"
      ? `[Tweet] ${post.title.slice(0, 50)}`
      : `[r/${post.subreddit}] ${post.title.slice(0, 45)}`
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
    console.log(`\n✅ No posts scored >= ${MIN_SCORE}. Try again later or lower MIN_SCORE.`)
    return
  }

  console.log(`\n✅ ${scored.length} high-value posts. Starting review...\n`)
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
      const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
      console.log(`\n✏️  Updated:\n\n${finalReply}`)
      const ok = (await rl.question("\nApprove? [y/n]: ")).trim().toLowerCase()
      if (ok !== "y") continue
    }

    const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
    approved.push({ post, report, reply: finalReply })
    console.log("\n✅ Approved — opening thread...\n")
    console.log("┌─ COPY THIS ──────────────────────────────────────────────┐")
    console.log(finalReply)
    console.log("└──────────────────────────────────────────────────────────┘")
    const { exec } = await import("child_process")
    const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
    exec(`${openCmd} "${post.url}"`)
    await rl.question("\nPress Enter once you've posted...")
  }

  rl.close()
  separator()
  console.log(`🏁 Done. ${approved.length} posted out of ${scored.length} reviewed.\n`)

  if (approved.length) {
    console.log("📋 Session log:\n")
    approved.forEach(({ post, report, reply }, i) => {
      const src = post.source === "twitter" ? "Twitter" : `r/${post.subreddit}`
      console.log(`[${i + 1}] ${src} — ${post.title.slice(0, 60)}`)
      console.log(`    Report pitched: ${report}`)
      console.log(`    ${post.url}\n`)
    })
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message)
  process.exit(1)
})
