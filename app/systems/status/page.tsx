import type { Metadata } from "next"
import { OperationsShell } from "@/components/systems/operations-shell"
import { StatusOverview } from "@/components/systems/status-overview"
import { getStatusOverview } from "@/components/systems/operations-data"

export const metadata: Metadata = {
  title: "Status | AVIntelligence Systems",
  description: "Current production status for AVIntelligence public services.",
}

export const dynamic = "force-dynamic"

export default async function SystemsStatusPage() {
  const status = await getStatusOverview()
  return <OperationsShell active="status"><StatusOverview status={status} /></OperationsShell>
}
