import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Smart Storage | AVIntelligence",
  description: "Turn personal and business files into a correctable data layer for reports, visualizations, and analysis.",
}

export default function SmartStorageLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
