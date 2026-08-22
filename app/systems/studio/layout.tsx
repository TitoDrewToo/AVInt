import type { ReactNode } from "react"
import { StudioWorkspaceGate } from "@/components/studio-workspace-gate"

export default function StudioWorkspaceLayout({ children }: { children: ReactNode }) {
  return <StudioWorkspaceGate>{children}</StudioWorkspaceGate>
}
