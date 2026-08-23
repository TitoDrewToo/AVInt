import type { Metadata } from "next"
import { LiveChangelog } from "@/components/systems/live-changelog"
import { getLiveChangelog } from "@/components/systems/operations-data"
import { OperationsShell } from "@/components/systems/operations-shell"

export const metadata: Metadata = {
  title: "Changelog | AVIntelligence Systems",
  description: "A live record of meaningful AVIntelligence product, reliability, and performance changes.",
}

export const revalidate = 600

export default async function SystemsChangelogPage() {
  const changelog = await getLiveChangelog()
  return <OperationsShell active="changelog"><LiveChangelog days={changelog.days} error={changelog.error} /></OperationsShell>
}
