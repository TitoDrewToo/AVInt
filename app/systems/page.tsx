import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import { SystemsOverview } from "@/components/systems/systems-overview"

export default function SystemsHubPage() {
  return <SystemsInternalGate><OperationsShell active="overview"><SystemsOverview /></OperationsShell></SystemsInternalGate>
}
