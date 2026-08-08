"use client"

import { supabase } from "./supabase"
import { sanitizeErrorContext, sanitizeErrorString } from "./error-sanitize"

export const BENIGN_ERROR_PATTERNS: RegExp[] = [
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i,
  /Non-Error promise rejection captured/i,
  /chrome-extension:\/\//i,
  /moz-extension:\/\//i,
]

function errorParts(error: unknown): { message: string; stack: string | null } {
  if (error instanceof Error) return { message: error.message, stack: error.stack ?? null }
  if (typeof error === "string") return { message: error, stack: null }
  try {
    return { message: JSON.stringify(error), stack: null }
  } catch {
    return { message: String(error), stack: null }
  }
}

export function isBenignError(error: unknown): boolean {
  const { message } = errorParts(error)
  return BENIGN_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}

export function captureError(
  tool: string,
  fn: string,
  action: string,
  error: unknown,
  context?: unknown,
): void {
  try {
    const parts = errorParts(error)
    if (isBenignError(error)) return
    const payload = {
      tool: sanitizeErrorString(tool, 120),
      fn: sanitizeErrorString(fn, 160),
      action: sanitizeErrorString(action, 160),
      route: typeof window === "undefined" ? null : window.location.pathname,
      message: sanitizeErrorString(parts.message || "Unknown client error"),
      stack: parts.stack ? sanitizeErrorString(parts.stack, 8_000) : null,
      context: sanitizeErrorContext(context),
      environment: process.env.NODE_ENV,
    }
    void supabase.auth.getSession()
      .then(({ data }) => fetch("/api/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }))
      .catch(() => {})
  } catch {
    // Client telemetry must never surface as a second client error.
  }
}
