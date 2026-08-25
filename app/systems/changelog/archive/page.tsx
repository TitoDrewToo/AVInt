import type { Metadata } from "next"
import { ChangelogArchive } from "@/components/systems/changelog-archive"
import { getLiveChangelog } from "@/components/systems/operations-data"
import { OperationsShell } from "@/components/systems/operations-shell"

export const metadata: Metadata = {
  title: "Changelog Archive | AVIntelligence Systems",
  description: "Searchable archive of meaningful AVIntelligence product, reliability, and performance changes.",
}

export const revalidate = 600

export default async function SystemsChangelogArchivePage() {
  const changelog = await getLiveChangelog()
  return <OperationsShell active="changelog"><ChangelogArchive days={changelog.days} error={changelog.error} /></OperationsShell>
}
