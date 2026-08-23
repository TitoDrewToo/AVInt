import type { ReactNode } from "react"
import { OperationsShell } from "@/components/systems/operations-shell"
import { SystemsInternalGate } from "@/components/systems/systems-access"

export default function StudioWorkspaceLayout({ children }: { children: ReactNode }) {
  return <SystemsInternalGate><OperationsShell active="studio">{children}</OperationsShell></SystemsInternalGate>
}
