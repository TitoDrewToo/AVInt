import { createClient, serve } from "../_shared/deps.ts"
import { type AiProvider, isProviderFailure, providerChain } from "../_shared/ai-providers.ts"
import { fetchWithTimeout } from "../_shared/fetch.ts"

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const PRESCAN_PROVIDERS = providerChain("PRESCAN", "gemini", "openai")
const SMART_SECURITY_URL = (Deno.env.get("SMART_SECURITY_URL") ?? "").replace(/\/+$/, "")
const SMART_SECURITY_API_KEY = Deno.env.get("SMART_SECURITY_API_KEY") ?? ""
const SMART_SECURITY_REQUIRED = (Deno.env.get("SMART_SECURITY_REQUIRED") ?? "false").toLowerCase() === "true"

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
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]

const ALLOWED_EXTENSIONS_BY_MIME: Record<string, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "image/heic": ["heic"],
  "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
}

const SUSPICIOUS_PDF_MARKERS = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/OpenAction",
  "/AA",
  "/RichMedia",
  "/SubmitForm",
  "/ImportData",
]

const SUSPICIOUS_XLSX_MARKERS = [
  "vbaProject.bin",
  "xl/vbaProject.bin",
  "xl/activeX/",
  "xl/embeddings/",
  "xl/externalLinks/",
  "xl/ctrlProps/",
  "oleObject",
]

function hasAsciiSequence(bytes: Uint8Array, needle: string): boolean {
  const encoded = new TextEncoder().encode(needle)
  outer: for (let i = 0; i <= bytes.length - encoded.length; i++) {
    for (let j = 0; j < encoded.length; j++) {
      if (bytes[i + j] !== encoded[j]) continue outer
    }
    return true
  }
  return false
}

function hasAsciiSequenceCaseInsensitive(bytes: Uint8Array, needle: string): boolean {
  const haystack = new TextDecoder("latin1").decode(bytes).toLowerCase()
  return haystack.includes(needle.toLowerCase())
}

function validateSpreadsheetContainer(bytes: Uint8Array, detected: string): { ok: boolean; reason?: string } {
  if (detected === "application/vnd.ms-excel") {
    return { ok: false, reason: "Legacy XLS files are not supported because they can contain opaque macro content." }
  }
  if (detected !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return { ok: true }
  }
  const requiredMarkers = [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
  ]
  const hasAllMarkers = requiredMarkers.every((marker) => hasAsciiSequence(bytes, marker))
  if (!hasAllMarkers) {
    return { ok: false, reason: "Spreadsheet container is malformed or not a valid workbook." }
  }
  const suspiciousMarker = SUSPICIOUS_XLSX_MARKERS.find((marker) => hasAsciiSequenceCaseInsensitive(bytes, marker))
  if (suspiciousMarker) {
    return { ok: false, reason: `Spreadsheet contains unsupported active or embedded content (${suspiciousMarker}).` }
  }
  return { ok: true }
}

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
  // Legacy xls (OLE compound file). Detect it so prescan can reject explicitly.
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

function normalizePdfNames(text: string): string {
  return text
    .replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .toLowerCase()
}

// PDF quick parse: confirm not encrypted + extract rough page count from /Count tokens
async function analyzePdf(bytes: Uint8Array): Promise<{ ok: boolean; reason?: string; pages?: number }> {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 16384)))
  if (!head.startsWith("%PDF-")) return { ok: false, reason: "Not a valid PDF header" }
  const fullText = new TextDecoder("latin1").decode(bytes)
  if (/\/Encrypt\s/.test(fullText)) return { ok: false, reason: "Encrypted PDFs are not supported" }
  const normalizedText = normalizePdfNames(fullText)
  if (SUSPICIOUS_PDF_MARKERS.some((marker) => normalizedText.includes(marker.toLowerCase()))) {
    return { ok: false, reason: "PDF contains active or embedded content that is not supported." }
  }
  // /Count N inside a /Type /Pages dict. Multiple may exist; take the largest non-leaf.
  const counts = [...fullText.matchAll(/\/Count\s+(\d+)/g)].map(m => parseInt(m[1], 10)).filter(n => !Number.isNaN(n))
  const pages = counts.length ? Math.max(...counts) : undefined
  if (pages !== undefined && pages > MAX_PDF_PAGES) {
    return { ok: false, reason: `PDF exceeds page limit (${pages} > ${MAX_PDF_PAGES})` }
  }
  return { ok: true, pages }
}

function analyzeCsv(bytes: Uint8Array): { ok: boolean; reason?: string } {
  const text = new TextDecoder("utf-8").decode(bytes)
  const rows = text.split(/\r?\n/).slice(0, 500)
  for (const row of rows) {
    const cells = row.split(",")
    for (const cell of cells) {
      const value = cell.trim().replace(/^"+|"+$/g, "").trim()
      if (/^[=@+]/.test(value) || /^-(?!\d+(\.\d+)?$)/.test(value)) {
        return { ok: false, reason: "CSV contains spreadsheet formulas or command-like cells." }
      }
    }
  }
  return { ok: true }
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

type SmartSecurityDecision = "clean" | "suspicious" | "infected" | "scan_error"

type SmartSecurityResult = {
  decision: SmartSecurityDecision
  risk_score?: number
  signals?: string[]
  scanner?: {
    clamav?: { status?: string; summary?: string; signature?: string }
    structural?: { status?: string; signals?: string[] }
  }
}

async function runGeminiSafety(mimeType: string, base64: string): Promise<SafetyResult> {
  const res = await fetchWithTimeout(
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
        },
      }),
    }
  )
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 500)
    throw new Error(`Gemini safety HTTP ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText) {
    throw new Error(`Gemini safety empty response: ${JSON.stringify(data).slice(0, 500)}`)
  }
  // Strip markdown fences, then extract first top-level JSON object (matches process-document shape).
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  const objectMatch = stripped.match(/\{[\s\S]*\}/)
  if (!objectMatch) throw new Error(`Gemini safety no JSON object in: ${stripped.slice(0, 300)}`)
  const parsed = JSON.parse(objectMatch[0])
  return {
    is_processable: Boolean(parsed.is_processable),
    doc_category: String(parsed.doc_category ?? "unrelated"),
    confidence: Number(parsed.confidence ?? 0),
    abuse_flag: Boolean(parsed.abuse_flag),
    reason: String(parsed.reason ?? ""),
  }
}

function parseSafetyJson(provider: string, rawText: string): SafetyResult {
  const stripped = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()
  const objectMatch = stripped.match(/\{[\s\S]*\}/)
  if (!objectMatch) throw new Error(`${provider} safety no JSON object in: ${stripped.slice(0, 300)}`)
  const parsed = JSON.parse(objectMatch[0])
  return {
    is_processable: Boolean(parsed.is_processable),
    doc_category: String(parsed.doc_category ?? "unrelated"),
    confidence: Number(parsed.confidence ?? 0),
    abuse_flag: Boolean(parsed.abuse_flag),
    reason: String(parsed.reason ?? ""),
  }
}

function openAiFilePart(mimeType: string, base64: string) {
  if (mimeType === "application/pdf") {
    return {
      type: "input_file",
      filename: "document.pdf",
      file_data: base64,
    }
  }
  if (mimeType.startsWith("image/")) {
    return {
      type: "input_image",
      image_url: `data:${mimeType};base64,${base64}`,
    }
  }
  return null
}

async function runOpenAISafety(mimeType: string, base64: string): Promise<SafetyResult> {
  const filePart = openAiFilePart(mimeType, base64)
  if (!filePart) throw new Error(`OpenAI prescan does not support MIME type ${mimeType}`)
  const res = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [{
        role: "user",
        content: [
          filePart,
          { type: "input_text", text: SAFETY_PROMPT },
        ],
      }],
      temperature: 0,
      max_output_tokens: 512,
    }),
  })
  if (!res.ok) {
    const errBody = (await res.text()).slice(0, 500)
    throw new Error(`OpenAI safety HTTP ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  const rawText =
    data.output_text ??
    data.output?.flatMap((item: any) => item.content ?? []).find((part: any) => part.type === "output_text")?.text ??
    ""
  if (!rawText) throw new Error(`OpenAI safety empty response: ${JSON.stringify(data).slice(0, 500)}`)
  return parseSafetyJson("OpenAI", rawText)
}

async function runSafety(provider: AiProvider, mimeType: string, base64: string): Promise<SafetyResult> {
  if (provider === "gemini") return await runGeminiSafety(mimeType, base64)
  if (provider === "openai") return await runOpenAISafety(mimeType, base64)
  throw new Error(`Unsupported prescan provider: ${provider}`)
}

async function runSmartSecurityScan(file: any, detectedMime: string): Promise<SmartSecurityResult | null> {
  if (!SMART_SECURITY_URL || !SMART_SECURITY_API_KEY) {
    if (SMART_SECURITY_REQUIRED) {
      throw new PrescanReject("smart_security_unconfigured", "Smart Security is required but not configured.")
    }
    console.warn("Smart Security skipped: URL or API key missing")
    return null
  }

  const res = await fetchWithTimeout(`${SMART_SECURITY_URL}/v1/scan/file`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-smart-security-key": SMART_SECURITY_API_KEY,
    },
    body: JSON.stringify({
      app_id: "avintelligence",
      file_id: file.id,
      storage_path: file.storage_path,
      mime_type: detectedMime,
      filename: file.filename ?? null,
    }),
  }, 60_000)

  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`Smart Security HTTP ${res.status}: ${bodyText.slice(0, 300)}`)
  }

  const parsed = JSON.parse(bodyText) as SmartSecurityResult
  if (!["clean", "suspicious", "infected", "scan_error"].includes(parsed.decision)) {
    throw new Error(`Smart Security returned an unknown decision: ${String((parsed as any).decision)}`)
  }
  return parsed
}

function smartSecurityRejectMessage(result: SmartSecurityResult): string {
  const signals = (result.signals ?? []).slice(0, 3).join(", ")
  if (result.decision === "infected") {
    const signature = result.scanner?.clamav?.signature
    return signature ? `Malware signature detected: ${signature}` : "Malware signature detected."
  }
  if (result.decision === "suspicious") {
    return signals ? `Risky file structure detected: ${signals}` : "Risky file structure detected."
  }
  return "Smart Security could not complete the scan."
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
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
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
    const extension = String(file.filename ?? "").split(".").pop()?.toLowerCase() ?? ""
    const allowedExtensions = ALLOWED_EXTENSIONS_BY_MIME[detected] ?? []
    if (!extension || !allowedExtensions.includes(extension)) {
      throw new PrescanReject("extension_mismatch", "File extension does not match the detected document type.")
    }
    // Soft-check declared vs detected (declared MIME can legitimately be more specific)
    const declared = (file.file_type || "").toLowerCase()
    const genericDeclared = declared === "application/octet-stream" || declared === "binary/octet-stream"
    const csvDeclaredAsExcel = detected === "text/csv" && declared === "application/vnd.ms-excel" && extension === "csv"
    if (declared && !genericDeclared && !csvDeclaredAsExcel && !declared.startsWith("text/") && declared !== detected &&
        !(declared.startsWith("image/") && detected.startsWith("image/"))) {
      throw new PrescanReject("mime_mismatch", "Declared file type does not match the actual file contents.")
    }

    // Tier 1.3 — structural parse (PDF only for now; others pass via magic byte)
    if (detected === "application/pdf") {
      const pdf = await analyzePdf(bytes)
      if (!pdf.ok) throw new PrescanReject("pdf_invalid", pdf.reason ?? "Invalid PDF structure.")
    }
    if (detected === "text/csv") {
      const csv = analyzeCsv(bytes)
      if (!csv.ok) throw new PrescanReject("csv_invalid", csv.reason ?? "Invalid CSV content.")
    }
    const workbookCheck = validateSpreadsheetContainer(bytes, detected)
    if (!workbookCheck.ok) {
      throw new PrescanReject("spreadsheet_invalid", workbookCheck.reason ?? "Spreadsheet validation failed.")
    }

    // Tier 1.4 — hash
    const sha = await sha256Hex(bytes)
    const { data: duplicateQuarantine } = await supabase
      .from("files")
      .select("id, scan_reason")
      .eq("sha256", sha)
      .eq("upload_status", "quarantined")
      .limit(1)
      .maybeSingle()
    if (duplicateQuarantine) {
      throw new PrescanReject("known_quarantined_hash", duplicateQuarantine.scan_reason || "This file matches a previously quarantined upload.")
    }

    // Tier 1.5 — Smart Security active file defense.
    // This calls the standalone Cloud Run scanner before any AI extraction.
    // Required mode is controlled by SMART_SECURITY_REQUIRED so rollout can
    // start in observe mode and become fail-closed without another deploy.
    try {
      const smartSecurity = await runSmartSecurityScan(file, detected)
      if (smartSecurity?.decision === "infected" || smartSecurity?.decision === "suspicious") {
        throw new PrescanReject(`smart_security_${smartSecurity.decision}`, smartSecurityRejectMessage(smartSecurity))
      }
      if (smartSecurity?.decision === "scan_error" && SMART_SECURITY_REQUIRED) {
        throw new PrescanReject("smart_security_scan_error", smartSecurityRejectMessage(smartSecurity))
      }
      if (smartSecurity?.decision === "scan_error") {
        console.warn("Smart Security scan_error ignored in observe mode:", JSON.stringify(smartSecurity).slice(0, 500))
      }
    } catch (e) {
      if (e instanceof PrescanReject) throw e
      const message = e instanceof Error ? e.message : String(e)
      if (SMART_SECURITY_REQUIRED) {
        throw new PrescanReject("smart_security_unavailable", "Smart Security scan could not complete. Please try again.")
      }
      console.error("Smart Security unavailable in observe mode:", message)
    }

    // Tier 2 — AI Safety Pass
    // Spreadsheets skip safety; Tier 1 magic byte + formula/macro checks are the gate.
    const isSpreadsheet =
      detected === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      detected === "text/csv"

    let safety: SafetyResult | null = null
    if (!isSpreadsheet) {
      const base64 = toBase64(bytes)
      let lastSafetyError: unknown = null
      for (const provider of PRESCAN_PROVIDERS) {
        try {
          safety = await runSafety(provider, detected, base64)
          break
        } catch (e) {
          lastSafetyError = e
          console.error(`${provider} safety failed:`, e instanceof Error ? e.message : String(e))
          if (!isProviderFailure(e)) break
        }
      }
      if (!safety) {
        console.error("All prescan providers failed:", lastSafetyError instanceof Error ? lastSafetyError.message : String(lastSafetyError))
        throw new PrescanReject("safety_check_failed", "Safety check could not complete. Please try again.")
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
