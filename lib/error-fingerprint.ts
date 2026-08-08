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

// FNV-1a is intentionally implemented without a runtime-specific crypto
// import so the same fingerprint code works in Next.js, browsers, and Deno.
export function createErrorFingerprint(input: {
  tool?: string | null
  fn?: string | null
  action?: string | null
  message?: string | null
}): string {
  const source = fingerprintInput(input)
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte)
    hash = BigInt.asUintN(64, hash * 0x100000001b3n)
  }
  return `err_${hash.toString(16).padStart(16, "0")}`
}

export function occurredAtManila(occurredAt: string | Date): string {
  const date = typeof occurredAt === "string" ? new Date(occurredAt) : occurredAt
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date).replace(", ", " ")
}
