export const SUSPICIOUS_PDF_MARKERS = [
  "/JavaScript",
  "/JS",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
  "/SubmitForm",
  "/ImportData",
]

const CONDITIONAL_PDF_ACTION_MARKERS = ["/OpenAction", "/AA"]
const UNSAFE_ACTION_MARKERS = ["/JavaScript", "/JS", "/Launch"]
export const MAX_PDF_PAGES = 100

function normalizePdfNames(text: string): string {
  return text
    .replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .toLowerCase()
}

function hasMarker(text: string, marker: string): boolean {
  return new RegExp(`${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(text)
}

function hasUnsafeAction(text: string, marker: string): boolean {
  const actionPattern = new RegExp(
    `${marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\[[^\\]]*\\]|<<[\\s\\S]*?>>|\\d+\\s+\\d+\\s+R)`,
    "gi",
  )

  for (const match of text.matchAll(actionPattern)) {
    const action = match[1] ?? ""
    if (UNSAFE_ACTION_MARKERS.some((unsafe) => hasMarker(action, unsafe))) return true

    for (const ref of action.matchAll(/(\d+)\s+\d+\s+R/g)) {
      const objectPattern = new RegExp(`${ref[1]}\\s+\\d+\\s+obj\\b([\\s\\S]*?)endobj`, "i")
      const object = text.match(objectPattern)?.[1] ?? ""
      if (UNSAFE_ACTION_MARKERS.some((unsafe) => hasMarker(object, unsafe))) return true
    }
  }

  return false
}

// PDF quick parse: confirm not encrypted + extract rough page count from /Count tokens.
export function analyzePdf(bytes: Uint8Array): { ok: boolean; reason?: string; pages?: number } {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(bytes.length, 16384)))
  if (!head.startsWith("%PDF-")) return { ok: false, reason: "Not a valid PDF header" }
  const fullText = new TextDecoder("latin1").decode(bytes)
  if (/\/Encrypt\s/.test(fullText)) return { ok: false, reason: "Encrypted PDFs are not supported" }

  const normalizedText = normalizePdfNames(fullText)
  if (SUSPICIOUS_PDF_MARKERS.some((marker) => hasMarker(normalizedText, marker))) {
    return { ok: false, reason: "PDF contains active or embedded content that is not supported." }
  }
  if (CONDITIONAL_PDF_ACTION_MARKERS.some((marker) => hasUnsafeAction(normalizedText, marker))) {
    return { ok: false, reason: "PDF contains active or embedded content that is not supported." }
  }

  const counts = [...fullText.matchAll(/\/Count\s+(\d+)/g)].map((m) => parseInt(m[1], 10)).filter((n) => !Number.isNaN(n))
  const pages = counts.length ? Math.max(...counts) : undefined
  if (pages !== undefined && pages > MAX_PDF_PAGES) {
    return { ok: false, reason: `PDF exceeds page limit (${pages} > ${MAX_PDF_PAGES})` }
  }
  return { ok: true, pages }
}
