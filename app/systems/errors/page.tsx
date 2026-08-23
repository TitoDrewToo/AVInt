import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import ErrorTriageConsole from "@/components/systems/error-triage-console"

export default function SystemsErrorsPage() {
  return <SystemsInternalGate><OperationsShell active="errors"><ErrorTriageConsole /></OperationsShell></SystemsInternalGate>
}
