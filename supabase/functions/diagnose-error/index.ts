import { createClient, serve } from "../_shared/deps.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"
import { sanitizeErrorContext, sanitizeErrorString } from "../_shared/error-sanitize.ts"
import { logError } from "../_shared/log.ts"

const FN = "diagnose-error"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
const SYSTEMS_INTERNAL_SECRET = Deno.env.get("SYSTEMS_INTERNAL_SECRET") ?? ""
const ANTHROPIC_SYSTEMS_API_KEY = Deno.env.get("ANTHROPIC_SYSTEMS_API_KEY") ?? ""
const ANTHROPIC_SYSTEMS_MODEL = Deno.env.get("ANTHROPIC_SYSTEMS_MODEL") ?? "claude-haiku-4-5-20251001"

const SYSTEM_PROMPT = `You are AVIntelligence's internal error-triage assistant operating in observation mode.
Diagnose the supplied application error using only the supplied error fields and the relevant system journal section.
Never ask for, infer, or reproduce raw user documents, document contents, full emails, secrets, tokens, or unrelated personal data.
Do not propose executing code or changing production directly. The proposed_fix must be a human-readable diagnosis and suggested code/config change for an engineer to review.
Return ONLY strict JSON with exactly these fields:
{
  "root_cause": "...",
  "affected_area": "...",
  "proposed_fix": "...",
  "risk_level": "low" | "medium" | "high",
  "confidence": 0.0,
  "severity": "...",
  "needs_more": { "time": false, "topic": false }
}
Confidence must be a number from 0 to 1. If evidence is incomplete, say so and lower confidence.`

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function validString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim() ? sanitizeErrorString(value, maxLength) : null
}

function parseDiagnosis(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf("{")
    const end = cleaned.lastIndexOf("}")
    if (start < 0 || end <= start) throw new Error("Anthropic returned non-JSON diagnosis")
    parsed = JSON.parse(cleaned.slice(start, end + 1))
  }
  const rootCause = validString(parsed.root_cause, 4_000)
  const affectedArea = validString(parsed.affected_area, 1_000)
  const proposedFix = validString(parsed.proposed_fix, 4_000)
  const riskLevel = parsed.risk_level
  const confidence = parsed.confidence
  const severity = validString(parsed.severity, 80)
  const needsMore = parsed.needs_more && typeof parsed.needs_more === "object" ? parsed.needs_more as Record<string, unknown> : {}
  if (!rootCause || !affectedArea || !proposedFix || !severity || !["low", "medium", "high"].includes(String(riskLevel))) {
    throw new Error("Anthropic diagnosis failed schema validation")
  }
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Anthropic diagnosis confidence is invalid")
  }
  return {
    root_cause: rootCause,
    affected_area: affectedArea,
    proposed_fix: proposedFix,
    risk_level: riskLevel as "low" | "medium" | "high",
    confidence,
    severity,
    needs_more: { time: needsMore.time === true, topic: needsMore.topic === true },
  }
}

async function callAnthropic(prompt: string) {
  if (!ANTHROPIC_SYSTEMS_API_KEY) throw new Error("ANTHROPIC_SYSTEMS_API_KEY is not configured")
  const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_SYSTEMS_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_SYSTEMS_MODEL,
      max_tokens: 900,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  if (!response.ok) throw new Error(`Anthropic systems diagnosis failed with HTTP ${response.status}`)
  const body = await response.json()
  const text = body?.content?.find((block: { type?: string }) => block.type === "text")?.text
  if (typeof text !== "string") throw new Error("Anthropic returned an empty diagnosis")
  return parseDiagnosis(text)
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST required" }, 405)
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!SYSTEMS_INTERNAL_SECRET || token !== SYSTEMS_INTERNAL_SECRET) return json({ error: "Internal systems secret required" }, 401)

  try {
    const body = await req.json()
    const fingerprint = validString(body?.fingerprint, 128)
    const journalSection = validString(body?.journal_section, 20_000)
    const error = body?.error ?? {}
    if (!fingerprint || !journalSection || !error || typeof error !== "object") return json({ error: "Invalid diagnosis payload" }, 400)

    const safeError = {
      message: validString(error.message, 2_000) ?? "Unknown error",
      stack: validString(error.stack, 8_000),
      tool: validString(error.tool, 120),
      fn: validString(error.fn, 160),
      action: validString(error.action, 160),
      route: validString(error.route, 500),
      context: sanitizeErrorContext(error.context) ?? null,
    }
    const prompt = [
      "RELEVANT SYSTEM JOURNAL SECTION:", journalSection,
      "\nSANITIZED ERROR:", JSON.stringify(safeError),
      "\nUse only this material. Return the exact JSON contract.",
    ].join("\n")
    const diagnosis = await callAnthropic(prompt)
    const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const diagnosedAt = new Date().toISOString()
    const { data, error: updateError } = await client
      .from("error_groups")
      .update({
        ai_analysis: `Root cause: ${diagnosis.root_cause}\nAffected area: ${diagnosis.affected_area}`,
        proposed_fix: diagnosis.proposed_fix,
        risk_level: diagnosis.risk_level,
        confidence: diagnosis.confidence,
        severity: diagnosis.severity,
        diagnosed_at: diagnosedAt,
        ai_model: ANTHROPIC_SYSTEMS_MODEL,
      })
      .eq("fingerprint", fingerprint)
      .select("fingerprint, ai_analysis, proposed_fix, risk_level, confidence, severity, diagnosed_at, ai_model")
      .maybeSingle()
    if (updateError || !data) throw new Error(updateError?.message ?? "Error group not found")
    return json({ ...diagnosis, ...data })
  } catch (error) {
    logError(FN, "diagnose", error)
    return json({ error: error instanceof Error ? error.message : "Diagnosis failed" }, 502)
  }
})
