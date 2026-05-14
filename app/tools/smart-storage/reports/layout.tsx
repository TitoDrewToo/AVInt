import type { Metadata } from "next"
import { ReportPrintTitleManager } from "@/components/report-print-title-manager"

export const metadata: Metadata = {
  title: "Report",
}

export default function SmartStorageReportsLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <ReportPrintTitleManager />
      {children}
    </>
  )
}
