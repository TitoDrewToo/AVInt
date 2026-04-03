#!/usr/bin/env node
/**
 * AVIntelligence — Reddit Content Pipeline
 * Monitors target subreddits for relevant threads, drafts contextual replies via Claude.
 * Run: node scripts/reddit-monitor.mjs
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
]

const RELEVANCE_KEYWORDS = [
  "receipt", "invoice", "expense", "tracking", "spreadsheet",
  "tax", "document", "organize", "accounting", "bookkeeping",
  "financial", "records", "receipts", "invoices", "payslip",
  "dext", "autoentry", "quickbooks", "wave", "manual entry",
  "too expensive", "affordable", "alternative",
]

const MIN_RELEVANCE_SCORE = 6  // 0-10, only show posts scoring >= this
const POSTS_PER_SUB = 25       // how many recent posts to check per subreddit

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
    headers: { "User-Agent": "AVIntelligence-Monitor/1.0" },
  })
  if (!res.ok) return []
  const data = await res.json()
  return data?.data?.children?.map((c) => c.data) ?? []
}

function isRelevant(post) {
  const text = `${post.title} ${post.selftext}`.toLowerCase()
  return RELEVANCE_KEYWORDS.some((kw) => text.includes(kw))
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
Body: ${post.selftext?.slice(0, 800) || "(no body)"}
`.trim()

  const systemPrompt = `You are helping AVIntelligence find relevant Reddit threads where the product could genuinely help.

AVIntelligence is an AI document intelligence tool for freelancers and self-employed professionals.
- Smart Storage: uploads receipts, invoices, payslips, contracts — AI extracts every field automatically
- Smart Dashboard: visualizes income vs expenses, spending by category, monthly trends, tax exposure
- 7 financial report types generated automatically
- Free tier available. $6 day pass. $12/month.
- Cheaper alternative to Dext ($40-50/month) and AutoEntry

Your job:
1. Score the relevance of this thread (0-10). Score high if the person is struggling with document management, expense tracking, receipt organization, tax prep, or looking for affordable alternatives.
2. Draft a reply in the voice of the solo founder who built AVIntelligence. Honest, direct, not salesy. Use phrases like "maybe have a look at what I made" or "I built this for exactly this problem" when natural. Sound like a person, not a marketer. Keep it under 80 words. Don't start with "I". No sycophancy. No exclamation marks.

Respond in this exact format:
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
  console.log("\n" + "─".repeat(70) + "\n")
}

function printPost(post, score, reply, index, total) {
  separator()
  console.log(`📌 [${index}/${total}] r/${post.subreddit} — Relevance: ${score}/10`)
  console.log(`🔗 https://reddit.com${post.permalink}`)
  console.log(`\n📝 ${post.title}`)
  if (post.selftext) console.log(`\n${post.selftext.slice(0, 400)}${post.selftext.length > 400 ? "..." : ""}`)
  const replyWithLink = reply.trimEnd() + "\n\nhttps://avintph.com"
  console.log(`\n💬 Drafted reply:\n\n${replyWithLink}`)
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 AVIntelligence Reddit Monitor")
  console.log(`Scanning ${SUBREDDITS.length} subreddits...\n`)

  // Fetch all posts
  const allPosts = []
  for (const sub of SUBREDDITS) {
    process.stdout.write(`  r/${sub}... `)
    const posts = await fetchSubreddit(sub)
    const relevant = posts.filter(isRelevant)
    console.log(`${posts.length} posts, ${relevant.length} relevant`)
    allPosts.push(...relevant)
  }

  if (!allPosts.length) {
    console.log("\n✅ No relevant posts found right now. Run again later.")
    return
  }

  // Deduplicate by post ID
  const seen = new Set()
  const unique = allPosts.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  console.log(`\n⚡ Scoring ${unique.length} posts with Claude...\n`)

  // Score and draft
  const scored = []
  for (const post of unique) {
    process.stdout.write(`  Scoring "${post.title.slice(0, 50)}..."`)
    try {
      const { score, reply } = await scoreAndDraft(post)
      process.stdout.write(` ${score}/10\n`)
      if (score >= MIN_RELEVANCE_SCORE && reply) {
        scored.push({ post, score, reply })
      }
    } catch (e) {
      process.stdout.write(` error: ${e.message}\n`)
    }
  }

  scored.sort((a, b) => b.score - a.score)

  if (!scored.length) {
    console.log(`\n✅ No posts scored >= ${MIN_RELEVANCE_SCORE}. Try lowering MIN_RELEVANCE_SCORE.`)
    return
  }

  console.log(`\n✅ ${scored.length} posts scored >= ${MIN_RELEVANCE_SCORE}/10. Starting review...\n`)
  console.log("Controls: [a] approve & open  [s] skip  [q] quit\n")

  const rl = readline.createInterface({ input, output })
  const approved = []

  for (let i = 0; i < scored.length; i++) {
    const { post, score, reply } = scored[i]
    printPost(post, score, reply, i + 1, scored.length)

    let answer = ""
    while (!["a", "s", "q"].includes(answer)) {
      answer = (await rl.question("\nAction [a/s/q]: ")).trim().toLowerCase()
    }

    if (answer === "q") break
    if (answer === "a") {
      const replyWithLink = reply.trimEnd() + "\n\nhttps://avintph.com"
      approved.push({ post, reply: replyWithLink })
      console.log("✅ Approved — opening thread in browser...")
      console.log(`\n--- COPY THIS ---\n${replyWithLink}\n--- END ---`)
      // Open Reddit thread in default browser
      const url = `https://reddit.com${post.permalink}`
      const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      const { exec } = await import("child_process")
      exec(`${openCmd} "${url}"`)
    }
  }

  rl.close()
  separator()
  console.log(`\n🏁 Session complete. ${approved.length} replies approved out of ${scored.length} reviewed.`)

  if (approved.length) {
    console.log("\n📋 All approved replies:\n")
    approved.forEach(({ post, reply }, i) => {
      console.log(`[${i + 1}] r/${post.subreddit} — ${post.title.slice(0, 60)}`)
      console.log(`    https://reddit.com${post.permalink}`)
      console.log(`    ${reply}\n`)
    })
  }
}

main().catch((e) => {
  console.error("Fatal error:", e.message)
  process.exit(1)
})
