import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { computeEntitlement } from "@/lib/subscription"
import {
  PRODUCT_ASSISTANT_SYSTEM_PROMPT,
  buildKnowledgeContext,
  buildLocalAssistantFallback,
  findRelevantKnowledge,
} from "@/lib/product-assistant"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authorizeAssistantRequest(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: subRow, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle()

  if (subErr) {
    return { error: serverError(subErr, { route: "chat", stage: "subscription_lookup", userId: user.id }) }
  }

  const ent = computeEntitlement(subRow)
  // Explicit bypass, opt-in only. Set ALLOW_CHAT_DEV_BYPASS=1 on dev / preview
  // envs that need unauthenticated chat. Previous `NODE_ENV !== "production"`
  // check was implicit and could unlock the assistant on a mis-set preview.
  if (process.env.ALLOW_CHAT_DEV_BYPASS === "1") {
    return { user }
  }

  if (!ent.isActive) {
    return { error: NextResponse.json({ error: "Active premium access required" }, { status: 403 }) }
  }

  return { user }
}

async function callOpenAI(question: string, context: string) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      temperature: 0.2,
      max_completion_tokens: 420,
      messages: [
        { role: "system", content: PRODUCT_ASSISTANT_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Question:\n${question}\n\nKnowledge:\n${context}`,
        },
      ],
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenAI API error: ${errorText}`)
  }

  const data = await res.json()
  return data.choices?.[0]?.message?.content?.trim() ?? null
}

export async function POST(req: NextRequest) {
  const auth = await authorizeAssistantRequest(req)
  if ("error" in auth) return auth.error

  try {
    const body = await req.json()
    const question = typeof body.question === "string" ? body.question.trim() : ""
    if (!question) {
      return NextResponse.json({ error: "Question is required" }, { status: 400 })
    }

    const sections = await findRelevantKnowledge(question)
    const context = buildKnowledgeContext(sections)

    let answer: string | null = null
    try {
      answer = await callOpenAI(question, context)
    } catch {
      answer = null
    }

    if (!answer) {
      const fallback = buildLocalAssistantFallback(question, sections)
      return NextResponse.json({
        answer: fallback.answer,
        bullets: fallback.bullets,
        sources: fallback.sources,
        provider: "local-fallback",
      })
    }

    return NextResponse.json({
      answer,
      bullets: [],
      sources: sections.map((section) => section.title),
      provider: "openai",
    })
  } catch (error) {
    return serverError(error, { route: "chat", stage: "unhandled" })
  }
}
