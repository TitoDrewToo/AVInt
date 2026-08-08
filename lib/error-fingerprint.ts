export { createErrorFingerprint, fingerprintInput, normalizeFingerprintPart } from "../supabase/functions/_shared/error-fingerprint"

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
