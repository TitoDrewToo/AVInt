import type { Metadata } from "next"
import { ReportPrintTitleManager } from "@/components/report-print-title-manager"
import { TooltipProvider } from "@/components/ui/tip"

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
      <TooltipProvider>{children}</TooltipProvider>
    </>
  )
}
