"use client"

import { useEffect } from "react"

export function ReportPrintTitleManager() {
  useEffect(() => {
    let originalTitle = document.title
    document.body.classList.add("smart-storage-report-route")

    const handleBeforePrint = () => {
      originalTitle = document.title
      const reportTitle = document.querySelector("main h1")?.textContent?.trim()
      document.title = reportTitle || "Report"
    }

    const handleAfterPrint = () => {
      document.title = originalTitle
    }

    window.addEventListener("beforeprint", handleBeforePrint)
    window.addEventListener("afterprint", handleAfterPrint)

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint)
      window.removeEventListener("afterprint", handleAfterPrint)
      document.body.classList.remove("smart-storage-report-route")
      document.title = originalTitle
    }
  }, [])

  return null
}
