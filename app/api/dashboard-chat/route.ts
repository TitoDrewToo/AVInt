import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { computeEntitlement } from "@/lib/entitlement"
import { checkRateLimit } from "@/lib/rate-limit"
import { buildDashboardAIContext } from "@/lib/dashboard-ai-context"
import { supabaseAdmin } from "@/lib/mcp-auth"

const SYSTEM_PROMPT = `You are the AVIntelligence dashboard assistant.
Use only the supplied account-scoped dashboard context. Never invent amounts, records, trends, causes, or fields.
If the data is sparse or a requested field is unavailable, say so plainly.
You may explain patterns and suggest useful visualizations, but you do not provide tax or legal advice.
Keep responses concise. Use What, So what, Now what when an insight is supported.`

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: subscription, error: subscriptionError } = await supabaseAdmin
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", auth.user.id)
      .maybeSingle()
    if (subscriptionError) throw new Error(subscriptionError.message)
    if (!computeEntitlement(subscription).isActive) {
      return NextResponse.json({ error: "Active premium access required" }, { status: 403 })
    }
    if (!(await checkRateLimit("chat", `dashboard:${auth.user.id}`, 60, 15))) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json()
    const question = typeof body.question === "string" ? body.question.trim() : ""
    if (!question) return NextResponse.json({ error: "Question is required" }, { status: 400 })

    const context = await buildDashboardAIContext(auth.user.id)
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        answer: context.readyRecordCount > 0
          ? `Your dashboard currently has ${context.readyRecordCount} normalized records across ${context.sourceCount} source files. I can use this data once the dashboard assistant provider is configured.`
          : "There are no normalized records available for dashboard analysis yet.",
        context,
        provider: "local-fallback",
      })
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_completion_tokens: 600,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `Question:\n${question}\n\nAccount dashboard context:\n${JSON.stringify(context)}` },
        ],
      }),
    })
    if (!response.ok) throw new Error("Dashboard assistant provider failed")
    const payload = await response.json()
    const answer = payload.choices?.[0]?.message?.content?.trim()
    if (!answer) throw new Error("Dashboard assistant returned no answer")
    return NextResponse.json({ answer, context, provider: "openai" })
  } catch (error) {
    return serverError(error, { route: "dashboard-chat", stage: "unhandled" })
  }
}
