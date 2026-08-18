import { NextRequest, NextResponse } from "next/server"
import JSZip from "jszip"
import { getReport } from "@/lib/report-engine"
import { computeFirmClientEntitlement } from "@/lib/entitlement"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { generateTaxBundleCSV } from "@/lib/tax-bundle"

function safeName(value: string) { return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim() || "document" }
function csvEscape(value: string) { return `"${value.replace(/"/g, '""')}"` }

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  const { data: auth, error: authError } = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null }, error: new Error("missing token") }
  if (authError || !auth.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const { data: admin } = await supabaseAdmin.from("firm_admins").select("firm_id").eq("user_id", auth.user.id).maybeSingle()
  if (!admin) return NextResponse.json({ error: "Firm administrator access required" }, { status: 403 })
  const { userId } = await params
  const { data: client } = await supabaseAdmin.from("firm_clients").select("user_id, created_at").eq("firm_id", admin.firm_id).eq("user_id", userId).maybeSingle()
  if (!client) return NextResponse.json({ error: "Client is not enrolled in this firm" }, { status: 404 })
  const entitlement = computeFirmClientEntitlement(client.created_at)
  if (!entitlement.isActive) return NextResponse.json({ error: "Client seat has expired" }, { status: 410 })

  const format = new URL(req.url).searchParams.get("format") ?? "zip"
  const result = await getReport(userId, entitlement, "tax-bundle")
  if (!("rows" in result) || !result.summary) return NextResponse.json({ error: "Could not generate Schedule C output" }, { status: 500 })
  if (format === "csv") {
    const csv = generateTaxBundleCSV(result.summary, {})
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="schedule-c-${userId}.csv"`, "Cache-Control": "no-store" } })
  }

  const zip = new JSZip()
  const rows = (result.rows ?? []).filter((row) => row.storage_path)
  const failures: string[] = []
  await Promise.all(rows.map(async (row) => {
    const path = row.storage_path!
    const { data, error } = await supabaseAdmin.storage.from("documents").download(path)
    if (error || !data) { failures.push(row.file_id); return }
    zip.file(`evidence/${row.file_id}--${safeName(row.filename)}`, await data.arrayBuffer())
  }))
  const allRows = result.rows ?? []
  zip.file("manifest.csv", ["File ID,Source File,Bundle Status", ...allRows.map((row) => `${row.file_id},${csvEscape(row.filename)},${failures.includes(row.file_id) ? "download_failed" : "bundled"}`)].join("\n") + "\n")
  zip.file("schedule-c-summary.csv", `Rows,${allRows.length}\n`)
  const bytes = await zip.generateAsync({ type: "uint8array" })
  return new NextResponse(bytes, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="audit-evidence-${userId}.zip"`, "Cache-Control": "no-store" } })
}
