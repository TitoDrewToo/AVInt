import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"
import { EconomicsOverview } from "@/components/systems/economics-overview"

export const dynamic = "force-dynamic"

export default function SystemsEconomicsPage() {
  return <SystemsInternalGate><OperationsShell active="economics"><EconomicsOverview /></OperationsShell></SystemsInternalGate>
}
