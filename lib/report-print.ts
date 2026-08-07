"use client"

const PRINT_STYLES = `
  @page {
    margin: 0;
    size: letter;
  }
  html,
  body {
    width: 100% !important;
    min-width: 0 !important;
    margin: 0 !important;
    background: white !important;
    color: black !important;
  }
  body {
    padding: 1.5cm !important;
    box-sizing: border-box !important;
    font-size: 11px !important;
  }
  nav,
  button,
  select,
  input,
  .print\\:hidden {
    display: none !important;
  }
  main {
    padding: 0 !important;
    width: 100% !important;
  }
  .mx-auto {
    width: 100% !important;
    max-width: 100% !important;
  }
  table {
    width: 100% !important;
    table-layout: fixed !important;
    font-size: 10px !important;
  }
  th,
  td {
    overflow-wrap: anywhere !important;
    word-break: normal !important;
  }
  th.text-right,
  td.text-right {
    white-space: nowrap !important;
  }
  .avint-export-footer {
    margin: 24px 0 0;
    color: #6b7280;
    font-size: 9px;
    letter-spacing: 0.02em;
    text-align: center;
  }
`

export function printReportOutput() {
  const reportMain = document.querySelector("main")
  const printWindow = window.open("", "_blank", "width=960,height=720")

  if (!reportMain) {
    window.alert("Unable to prepare the report for printing. Please reload the report and try again.")
    return
  }

  if (!printWindow) {
    window.alert("Unable to open the clean print window. Please allow pop-ups for this site and try Print / PDF again.")
    return
  }

  const styles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n")
  const reportMarkup = reportMain.cloneNode(true) as HTMLElement

  printWindow.document.open()
  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
    ${styles}
    <style>${PRINT_STYLES}</style>
  </head>
  <body class="smart-storage-report-route">
    ${reportMarkup.outerHTML}
    <p class="avint-export-footer">Prepared with AVIntelligence — organize your business documents automatically.</p>
  </body>
</html>`)
  printWindow.document.close()

  const waitForStylesheets = () => {
    const stylesheetLinks = Array.from(
      printWindow.document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    )

    if (stylesheetLinks.length === 0) return Promise.resolve()

    return Promise.all(stylesheetLinks.map((link) => new Promise<void>((resolve) => {
      if (link.sheet) {
        resolve()
        return
      }

      const finish = () => resolve()
      link.addEventListener("load", finish, { once: true })
      link.addEventListener("error", finish, { once: true })
      window.setTimeout(finish, 1000)
    }))).then(() => undefined)
  }

  const printCleanDocument = async () => {
    await waitForStylesheets()
    printWindow.document.title = ""
    printWindow.focus()
    printWindow.print()
  }

  printWindow.addEventListener("afterprint", () => {
    printWindow.close()
  }, { once: true })

  if (printWindow.document.readyState === "complete") {
    window.setTimeout(() => { void printCleanDocument() }, 150)
  } else {
    printWindow.addEventListener("load", () => {
      window.setTimeout(() => { void printCleanDocument() }, 150)
    }, { once: true })
  }
}
