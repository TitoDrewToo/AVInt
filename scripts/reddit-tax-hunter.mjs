#!/usr/bin/env node
/**
 * AVIntelligence — Reddit Tax Prep Hunter
 * Hunts for posts where people are struggling with tax preparation.
 * Drafts an honest reply pointing them to Smart Storage + Tax Bundle report.
 * Run: node scripts/reddit-tax-hunter.mjs
 * Requires: ANTHROPIC_API_KEY in .env.local
 */

import { readFileSync } from "fs"
import * as readline from "readline/promises"
import { stdin as input, stdout as output } from "process"

// ── Config ─────────────────────────────────────────────────────────────────

const SUBREDDITS = [
  "freelance",
  "selfemployed",
  "smallbusiness",
  "personalfinance",
  "Accounting",
  "tax",
  "taxadvice",
  "Philippines",
  "phcareers",
]

// Primary tax pain point keywords — at least one MUST match
const TAX_KEYWORDS = [
  "tax return", "tax prep", "tax season", "tax time", "tax filing",
  "file my taxes", "filing taxes", "taxes due", "pay taxes",
  "quarterly tax", "estimated tax", "self-employed tax",
  "1099", "freelance tax", "independent contractor tax",
  "tax deductions", "write-off", "write off", "business deductions",
  "proof of expenses", "expense receipts", "receipts for tax",
  "missing receipts", "lost receipts", "organize receipts",
  "bookkeeper", "accountant", "cpa", "tax professional",
  "bir", "annual itr", "itr filing", "bir form",
  "audit", "irs notice", "tax documents", "tax records",
  "how do i track", "track my expenses", "categorize expenses",
  "how much do i owe", "taxable income", "income tax",
  "freelancer taxes", "gig taxes", "side hustle taxes",
]

// Exclude noise — if these dominate the post it's probably not a good fit
const EXCLUDE_KEYWORDS = [
  "crypto tax", "nft tax", "capital gains stock", "inheritance tax",
  "estate tax", "property tax",
]

const MIN_SCORE = 7     // 0-10, only show posts scoring >= this
const POSTS_PER_SUB = 30

// ── Load API key ────────────────────────────────────────────────────────────

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
  console.error("❌ ANTHROPIC_API_KEY not found in .env.local")
  process.exit(1)
}

// ── Reddit API ──────────────────────────────────────────────────────────────

async function fetchSubreddit(sub) {
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=${POSTS_PER_SUB}`
  const res = await fetch(url, {
    headers: { "User-Agent": "AVIntelligence-TaxHunter/1.0" },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data?.data?.children?.map((c) => c.data) ?? []
}

function isTaxRelated(post) {
  const text = `${post.title} ${post.selftext}`.toLowerCase()
  // Must hit a tax keyword
  const hasTax = TAX_KEYWORDS.some((kw) => text.includes(kw))
  // Exclude posts dominated by out-of-scope tax topics
  const excluded = EXCLUDE_KEYWORDS.filter((kw) => text.includes(kw)).length > 1
  return hasTax && !excluded
}

// ── Claude API ──────────────────────────────────────────────────────────────

async function callClaude(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error: ${err}`)
  }
  const data = await res.json()
  return data.content?.[0]?.text ?? ""
}

async function scoreAndDraft(post) {
  const postContent = `
Title: ${post.title}
Subreddit: r/${post.subreddit}
Body: ${post.selftext?.slice(0, 900) || "(no body)"}
`.trim()

  const systemPrompt = `You are helping the solo founder of AVIntelligence find Reddit threads where people are struggling with tax preparation — and draft honest, helpful replies.

AVIntelligence — what it actually does:
- Smart Storage: upload receipts, invoices, payslips, contracts. AI reads every document and extracts fields automatically (amounts, dates, counterparties, categories).
- Tax Bundle Report: one-click report that computes gross income, deductible expenses, estimated taxable income, and tax withheld — ready for filing or handing to an accountant.
- Expense Summary, Income Summary, P&L — also auto-generated from uploaded documents.
- Free tier to try. $6 day pass (full access for 24h). $12/month.
- No manual data entry. Works on receipts, payslips, invoices — the exact documents you need for tax prep.
- Website: https://avintph.com

Scoring criteria (0-10):
- 9-10: Person is clearly overwhelmed with tax prep, can't organize receipts/invoices, doesn't know what to deduct, stressed about filing
- 7-8: Freelancer or self-employed person asking how to track expenses or what they owe
- 5-6: General tax question that doesn't directly involve document chaos
- 0-4: Tax question that is theoretical, about crypto, real estate, or not about document organization

Reply rules:
- Sound like the person who built this, not a marketer
- Be honest — tell them you made a tool specifically for this problem
- Tell them: upload their documents (receipts, invoices, payslips), the AI reads them, then generate the Tax Bundle report — it handles the computation
- Mention the day pass ($6) so they can try it without committing
- Max 90 words
- Don't start with "I"
- No exclamation marks
- No sycophancy ("great question", "love this thread")
- Don't pretend to be a neutral third party — you made this

Respond in exactly this format:
SCORE: [0-10]
REPLY:
[your drafted reply]`

  const response = await callClaude(systemPrompt, postContent)

  const scoreMatch = response.match(/SCORE:\s*(\d+)/)
  const replyMatch = response.match(/REPLY:\n([\s\S]+)/)

  const score = scoreMatch ? parseInt(scoreMatch[1]) : 0
  const reply = replyMatch ? replyMatch[1].trim() : ""

  return { score, reply }
}

// ── Terminal UI ─────────────────────────────────────────────────────────────

function separator() {
  console.log("\n" + "─".repeat(72) + "\n")
}

function printPost(post, score, reply, index, total) {
  separator()
  console.log(`📌 [${index}/${total}] r/${post.subreddit} — Tax pain score: ${score}/10`)
  console.log(`🔗 https://reddit.com${post.permalink}`)
  console.log(`\n📝 ${post.title}`)
  if (post.selftext) {
    console.log(`\n${post.selftext.slice(0, 500)}${post.selftext.length > 500 ? "..." : ""}`)
  }
  const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
  console.log(`\n💬 Drafted reply:\n`)
  console.log(finalReply)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🎯 AVIntelligence — Reddit Tax Prep Hunter")
  console.log(`Scanning ${SUBREDDITS.length} subreddits for tax pain...\n`)

  const allPosts = []
  for (const sub of SUBREDDITS) {
    process.stdout.write(`  r/${sub}... `)
    try {
      const posts = await fetchSubreddit(sub)
      const relevant = posts.filter(isTaxRelated)
      console.log(`${posts.length} posts, ${relevant.length} tax-related`)
      allPosts.push(...relevant)
    } catch (e) {
      console.log(`error: ${e.message}`)
    }
  }

  if (!allPosts.length) {
    console.log("\n✅ No tax-related posts found right now. Try again later.")
    return
  }

  // Deduplicate
  const seen = new Set()
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  console.log(`\n⚡ Scoring ${unique.length} posts with Claude...\n`)

  const scored = []
  for (const post of unique) {
    process.stdout.write(`  "${post.title.slice(0, 55)}..." `)
    try {
      const { score, reply } = await scoreAndDraft(post)
      process.stdout.write(`→ ${score}/10\n`)
      if (score >= MIN_SCORE && reply) {
        scored.push({ post, score, reply })
      }
    } catch (e) {
      process.stdout.write(`error: ${e.message}\n`)
    }
  }

  scored.sort((a, b) => b.score - a.score)

  if (!scored.length) {
    console.log(`\n✅ No posts scored >= ${MIN_SCORE}. Subreddits may be quiet today.`)
    return
  }

  console.log(`\n✅ ${scored.length} high-value posts found. Starting review...\n`)
  console.log("Controls: [a] approve & open in browser  [e] edit reply  [s] skip  [q] quit\n")

  const rl = readline.createInterface({ input, output })
  const approved = []

  for (let i = 0; i < scored.length; i++) {
    let { post, score, reply } = scored[i]
    printPost(post, score, reply, i + 1, scored.length)

    let answer = ""
    while (!["a", "e", "s", "q"].includes(answer)) {
      answer = (await rl.question("\nAction [a/e/s/q]: ")).trim().toLowerCase()
    }

    if (answer === "q") break
    if (answer === "s") continue

    if (answer === "e") {
      console.log("\nEnter your edited reply (type END on a new line when done):")
      const lines = []
      let line = ""
      while ((line = await rl.question("")) !== "END") {
        lines.push(line)
      }
      reply = lines.join("\n").trim()
      const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
      console.log(`\n✏️  Updated reply:\n\n${finalReply}`)
      const confirm = (await rl.question("\nApprove this? [y/n]: ")).trim().toLowerCase()
      if (confirm !== "y") continue
      answer = "a"
      reply = reply
    }

    if (answer === "a") {
      const finalReply = reply.trimEnd() + "\n\nhttps://avintph.com"
      approved.push({ post, reply: finalReply })
      console.log("\n✅ Approved — opening thread and copying reply...\n")
      console.log("┌─ COPY THIS ──────────────────────────────────────────────┐")
      console.log(finalReply)
      console.log("└──────────────────────────────────────────────────────────┘")
      const url = `https://reddit.com${post.permalink}`
      const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      const { exec } = await import("child_process")
      exec(`${openCmd} "${url}"`)
      await rl.question("\nPress Enter when you've posted the reply...")
    }
  }

  rl.close()
  separator()
  console.log(`🏁 Session complete. ${approved.length} replies posted out of ${scored.length} reviewed.\n`)

  if (approved.length) {
    console.log("📋 Session log:\n")
    approved.forEach(({ post, reply }, i) => {
      console.log(`[${i + 1}] r/${post.subreddit} — ${post.title.slice(0, 65)}`)
      console.log(`    https://reddit.com${post.permalink}`)
      console.log(`    ${reply.split("\n")[0]}...\n`)
    })
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message)
  process.exit(1)
})
