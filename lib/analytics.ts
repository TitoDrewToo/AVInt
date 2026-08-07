"use client"

import { track } from "@vercel/analytics/react"

export type ActivationEvent =
  | "document_uploaded"
  | "extraction_completed"
  | "report_exported"
  | "upgrade_clicked"
  | "subscribed"

type EventProperties = Record<string, string | number | boolean>

export function trackActivationEvent(event: ActivationEvent, properties: EventProperties = {}) {
  void track(event, properties)
}
