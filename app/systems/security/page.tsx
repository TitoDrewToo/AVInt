import { OperationsShell } from "@/components/systems/operations-shell"
import { SecurityOperations } from "@/components/systems/security-operations"
import { SystemsInternalGate } from "@/components/systems/systems-access"

export const dynamic = "force-dynamic"

export default function SystemsSecurityPage() {
  return <SystemsInternalGate><OperationsShell active="security"><SecurityOperations /></OperationsShell></SystemsInternalGate>
}
