const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi
const LONG_ID_PATTERN = /\b[a-z0-9_-]{16,}\b/gi
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\b/g
const WHITESPACE_PATTERN = /\s+/g

export function normalizeFingerprintPart(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(UUID_PATTERN, "<uuid>")
    .replace(LONG_ID_PATTERN, "<id>")
    .replace(NUMBER_PATTERN, "<number>")
    .replace(WHITESPACE_PATTERN, " ")
    .trim()
}

export function fingerprintInput(input: {
  tool?: string | null
  fn?: string | null
  action?: string | null
  message?: string | null
}): string {
  return [input.tool, input.fn, input.action, input.message]
    .map(normalizeFingerprintPart)
    .join("|")
}

export function createErrorFingerprint(input: {
  tool?: string | null
  fn?: string | null
  action?: string | null
  message?: string | null
}): string {
  const source = fingerprintInput(input)
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `err_${hash.toString(16).padStart(8, "0")}`
}
