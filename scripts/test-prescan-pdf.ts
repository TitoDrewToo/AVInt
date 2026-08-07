import { analyzePdf } from "../supabase/functions/_shared/pdf-prescan"

let passed = 0
let failed = 0

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++
    return
  }
  failed++
  console.error(`✗ ${name}`)
}

function pdf(body: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${body} >>\nendobj\n%%EOF`)
}

assert(
  "benign OpenAction view setting passes",
  analyzePdf(pdf("/OpenAction [3 0 R /FitH null] /Pages 3")).ok,
)
assert(
  "benign OpenAction Fit view passes",
  analyzePdf(pdf("/OpenAction [3 0 R /Fit] /Pages 1")).ok,
)
assert(
  "JavaScript in direct OpenAction is rejected",
  !analyzePdf(pdf("/OpenAction << /S /JavaScript /JS (app.alert\(1\)) >>")).ok,
)
assert(
  "JavaScript in indirect OpenAction is rejected",
  !analyzePdf(new TextEncoder().encode(
    "%PDF-1.7\n1 0 obj\n<< /Type /Catalog /OpenAction 5 0 R >>\nendobj\n5 0 obj\n<< /S /JavaScript /JS (app.alert(1)) >>\nendobj\n%%EOF",
  )).ok,
)
assert(
  "Launch in an additional action is rejected",
  !analyzePdf(pdf("/AA << /O << /S /Launch /F (calc) >> >>")).ok,
)
assert(
  "standalone JavaScript marker remains hard-blocked",
  !analyzePdf(pdf("/JavaScript (app.alert(1))")).ok,
)

console.log(`${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
