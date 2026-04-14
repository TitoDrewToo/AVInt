import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!

const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www.avintph.com,https://avintph.com").split(",").map(s => s.trim())
function buildCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? ""
  const allow = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  }
}

// ── Tier 1 limits ────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 60 * 1024 * 1024        // 60 MB (bucket limit is the hard cap)
const MAX_PDF_PAGES = 100                      // launch cap; raise for Pro tier later

const ALLOWED_MIME_PREFIXES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

// Magic-byte signatures. First-4KB sniff.
function detectMagicMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return "application/pdf" // %PDF
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return "image/png"
  }
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp" // RIFF....WEBP
  }
  // HEIC: ftypheic / ftypheix / ftyphevc / ftypmif1 at offset 4
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])
    if (["heic", "heix", "hevc", "mif1", "msf1", "heis"].includes(brand)) return "image/heic"
  }
  // xlsx / ODF / docx — all ZIP containers start with PK\x03\x04
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" // assume xlsx here; legacy xls is OLE
  }
  // Legacy xls (OLE compound file)
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) {
    return "application/vnd.ms-excel"
  }
  // CSV / plain text — accept if it decodes as UTF-8 and is mostly printable
  try {
    const sample = new TextDecoder("utf-8", { fatal: true }).decode(bytes.slice(0, Math.min(bytes.length, 1024)))
    const printableRatio = [...sample].filter(c => {
      const code = c.charCodeAt(0)
      return (code >= 0x20 && code < 0x7f) || code === 0x09 || code === 0x0a || code === 0x0d
    }).length / sample.length
    if (printableRatio > 0.95) return "text/csv"
  } catch {
    /* not utf-8 */
  }
  return null
}

// PDF quick parse: confirm not encrypted + extract rough page count from /Count tokens
async function analyzePdf(bytes: Uint8Array): Promise<{ ok: boolean; reason?: string; pages?: number }> {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 16384)))
  if (!head.startsWith("%PDF-")) return { ok: false, reason: "Not a valid PDF header" }
  const fullText = new TextDecoder("latin1").decode(bytes)
  if (/\/Encrypt\s/.test(fullText)) return { ok: false, reason: "Encrypted PDFs are not supported" }
  // /Count N inside a /Type /Pages dict. Multiple may exist; take the largest non-leaf.
  const counts = [...fullText.matchAll(/\/Count\s+(\d+)/g)].map(m => parseInt(m[1], 10)).filter(n => !Number.isNaN(n))
  const pages = counts.length ? Math.max(...counts) : undefined
  if (pages !== undefined && pages > MAX_PDF_PAGES) {
    return { ok: false, reason: `PDF exceeds page limit (${pages} > ${MAX_PDF_PAGES})` }
  }
  return { ok: true, pages }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("")
}

// Chunked base64 for large files
function toBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// ── Gemini Safety Pass ───────────────────────────────────────────────────────
const SAFETY_PROMPT = `You are a document classifier for a document-intelligence tool that ingests financial, operational, and employment records.

Classify whether this upload is suitable for ingestion.

ACCEPT any document that shows transactions, payments, income, expenses, contracts, tax data, employment records, insurance, or bank activity. This includes business, personal, AND employment documents. Capture method is irrelevant — screenshots of receipts ARE receipts, photos of payslips ARE payslips, scans of contracts ARE contracts.

Categories to accept:
- receipt (retail, restaurant, service)
- invoice
- bill (utility, subscription, service)
- payslip / pay stub
- statement (bank, credit card, account)
- contract / lease / agreement
- tax_form / tax_document
- medical_bill (hospital bills, prescription receipts, clinic invoices, lab bills, dental, vet — the BILLING/financial face of medical documents)
- insurance_claim (EOBs, claim forms, reimbursement records with amounts)
- insurance_document (policy, premium, coverage summary)
- payment_record / transaction / purchase_order
- other_financial (any other document with monetary content)

REJECT only if the content is genuinely unrelated:
- memes, jokes, social media posts
- game screenshots or game UI
- personal photos unrelated to records (vacation, pets, selfies, non-receipt food)
- blank or near-blank pages
- resumes / CVs
- marketing flyers or advertisements (unless tied to a specific purchase)
- random web content (articles, blog posts, tutorials)
- clinical medical records (lab results with diagnoses, imaging reports, doctor's notes, prescriptions showing medication details, therapy notes, medical history) — these are health records, not financial records
- government ID documents (passport, driver's license, SSN card, national ID)
- abuse content (illegal material, clearly malicious content)

DISTINCTION on medical: "how much did you pay and to whom" = ACCEPT (medical_bill / insurance_claim). "what is the patient's condition or treatment" = REJECT.

GRAY-AREA RULE: if the document contains any monetary amount, date, vendor/employer name, or transaction detail — even partial — ACCEPT it. The burden of proof is on rejection, not acceptance.

Return a single JSON object only, no markdown or explanation:
{
  "is_processable": true or false,
  "doc_category": "receipt" | "invoice" | "bill" | "payslip" | "statement" | "contract" | "tax_form" | "medical_bill" | "insurance_claim" | "insurance_document" | "payment_record" | "other_financial" | "unrelated",
  "confidence": number between 0 and 1,
  "abuse_flag": true or false,
  "reason": "short string describing why rejected, empty string if accepted"
}`

type SafetyResult = {
  is_processable: boolean
  doc_category: string
  confidence: number
  abuse_flag: boolean
  reason: string
}

async function runGeminiSafety(mimeType: string, base64: string): Promise<SafetyResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: SAFETY_PROMPT },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini safety API error: ${await res.text()}`)
  const data = await res.json()
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  const parsed = JSON.parse(stripped)
  return {
    is_processable: Boolean(parsed.is_processable),
    doc_category: String(parsed.doc_category ?? "unrelated"),
    confidence: Number(parsed.confidence ?? 0),
    abuse_flag: Boolean(parsed.abuse_flag),
    reason: String(parsed.reason ?? ""),
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  // Auth: user JWT required (prescan is user-triggered; no service role entry)
  const authHeader = req.headers.get("authorization") ?? ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing authorization" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const { data: userData, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  const userId = userData.user.id

  let body: any = {}
  try {
    const text = await req.text()
    if (text) body = JSON.parse(text)
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const { file_id } = body
  if (!file_id) {
    return new Response(JSON.stringify({ error: "file_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Load + ownership check
  const { data: file, error: fileError } = await supabase
    .from("files").select("*").eq("id", file_id).single()
  if (fileError || !file) {
    return new Response(JSON.stringify({ error: "File not found" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
  if (file.user_id !== userId) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Idempotency: only process rows in pending_scan
  if (file.upload_status !== "pending_scan") {
    return new Response(JSON.stringify({ ok: true, skipped: true, current_status: file.upload_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  // Inbox path check — must live under _inbox/
  const expectedPrefix = `${userId}/_inbox/`
  if (!file.storage_path?.startsWith(expectedPrefix)) {
    await quarantineRow(supabase, file, "invalid_inbox_path", "Upload path is not in the scan inbox.")
    return new Response(JSON.stringify({ quarantined: true, reason: "invalid_inbox_path" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  await supabase.from("files").update({ upload_status: "scanning" }).eq("id", file_id)

  try {
    // Download
    const { data: blob, error: dlErr } = await supabase.storage.from("documents").download(file.storage_path)
    if (dlErr || !blob) throw new Error("Download failed")
    const bytes = new Uint8Array(await blob.arrayBuffer())

    // Tier 1.1 — size
    if (bytes.length > MAX_FILE_SIZE) {
      throw new PrescanReject("size_exceeded", `File exceeds ${MAX_FILE_SIZE / (1024 * 1024)} MB limit.`)
    }

    // Tier 1.2 — magic byte
    const detected = detectMagicMime(bytes)
    if (!detected || !ALLOWED_MIME_PREFIXES.includes(detected)) {
      throw new PrescanReject("mime_mismatch", "File signature does not match an accepted document type.")
    }
    // Soft-check declared vs detected (declared MIME can legitimately be more specific)
    const declared = (file.file_type || "").toLowerCase()
    if (declared && !declared.startsWith("text/") && declared !== detected &&
        !(declared.startsWith("image/") && detected.startsWith("image/"))) {
      throw new PrescanReject("mime_mismatch", "Declared file type does not match the actual file contents.")
    }

    // Tier 1.3 — structural parse (PDF only for now; others pass via magic byte)
    if (detected === "application/pdf") {
      const pdf = await analyzePdf(bytes)
      if (!pdf.ok) throw new PrescanReject("pdf_invalid", pdf.reason ?? "Invalid PDF structure.")
    }

    // Tier 1.4 — hash
    const sha = await sha256Hex(bytes)

    // Tier 2 — Gemini Safety Pass
    // Spreadsheets skip safety (Gemini can't see them); Tier 1 magic byte is the gate.
    const isSpreadsheet = detected === "application/vnd.ms-excel" ||
      detected === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      detected === "text/csv"

    let safety: SafetyResult | null = null
    if (!isSpreadsheet) {
      const base64 = toBase64(bytes)
      try {
        safety = await runGeminiSafety(detected, base64)
      } catch (e) {
        // One retry on parse/network failure, then fail closed
        try {
          safety = await runGeminiSafety(detected, base64)
        } catch {
          throw new PrescanReject("safety_check_failed", "Safety check could not complete. Please try again.")
        }
      }
      if (!safety.is_processable || safety.abuse_flag || safety.confidence < 0.7) {
        const reason = safety.reason || "Document does not appear to be a financial or operational record."
        throw new PrescanReject("content_unrelated", reason)
      }
    }

    // ── Approved path ───────────────────────────────────────────────────────
    const canonicalPath = file.storage_path.replace(`${userId}/_inbox/`, `${userId}/`)
    const { error: moveErr } = await supabase.storage.from("documents").move(file.storage_path, canonicalPath)
    if (moveErr) throw new Error(`Move to canonical path failed: ${moveErr.message}`)

    await supabase.from("files").update({
      storage_path: canonicalPath,
      upload_status: "approved",
      sha256: sha,
      scanned_at: new Date().toISOString(),
      scan_reason: null,
      document_type: safety?.doc_category ?? file.document_type,
    }).eq("id", file_id)

    // Chain into process-document (service role — internal chain allowed)
    fetch(`${SUPABASE_URL}/functions/v1/process-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ file_id }),
    }).catch(err => console.error("process-document chain failed:", err))

    return new Response(
      JSON.stringify({ ok: true, approved: true, category: safety?.doc_category ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (err: any) {
    const isReject = err instanceof PrescanReject
    const reason = isReject ? err.code : "internal_error"
    const message = isReject ? err.message : "Scan failed. Please try again or contact support."
    await quarantineRow(supabase, file, reason, message)
    return new Response(
      JSON.stringify({ quarantined: true, reason, message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

class PrescanReject extends Error {
  constructor(public code: string, message: string) {
    super(message)
  }
}

async function quarantineRow(supabase: any, file: any, code: string, message: string) {
  const uid = file.user_id
  const quarantinePath = file.storage_path.startsWith(`${uid}/_inbox/`)
    ? file.storage_path.replace(`${uid}/_inbox/`, `${uid}/_quarantine/`)
    : `${uid}/_quarantine/${file.id}`
  try {
    await supabase.storage.from("documents").move(file.storage_path, quarantinePath)
  } catch (e) {
    console.error("quarantine move failed:", e)
  }
  await supabase.from("files").update({
    storage_path: quarantinePath,
    upload_status: "quarantined",
    scan_reason: `${code}: ${message}`,
    scanned_at: new Date().toISOString(),
  }).eq("id", file.id)
}
