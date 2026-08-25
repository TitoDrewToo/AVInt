import type { Metadata } from "next"
import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import ErrorTriageConsole from "@/components/systems/error-triage-console"

export const metadata: Metadata = {
  title: "Error Archive | AVIntelligence Systems",
  description: "Historical resolved and ignored error groups for AVIntelligence operations review.",
}

export default function SystemsErrorArchivePage() {
  return <SystemsInternalGate><OperationsShell active="errors"><ErrorTriageConsole archive /></OperationsShell></SystemsInternalGate>
}
