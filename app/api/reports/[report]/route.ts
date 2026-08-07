import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/entitlement"
import { generateQuickBooksCSV, generateXeroCSV } from "@/lib/accounting-csv"
import { overlapsDateRange } from "@/lib/report-utils"
import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { selectTaxBundleDefaultYear } from "@/lib/tax-bundle-default-year"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authorizeReportRequest(req: NextRequest, reportKey: string, exportFormat: string | null) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: subRow, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle()

  if (subErr) {
    return { error: serverError(subErr, { route: "reports/[report]", stage: "entitlement", userId: user.id }) }
  }

  const ent = computeEntitlement(subRow)
  if (exportFormat && !["quickbooks", "xero"].includes(exportFormat)) {
    return { error: NextResponse.json({ error: "Unsupported export format" }, { status: 400 }) }
  }

  if (exportFormat && !PLAN_LIMITS[ent.tier].accountingExports) {
    return {
      error: NextResponse.json({
        error: "QuickBooks and Xero exports require Day Pass or Pro access. Upgrade to export categorized transactions.",
        code: "ACCOUNTING_EXPORT_REQUIRES_PAID_PLAN",
      }, { status: 403 }),
    }
  }

  if (PLAN_LIMITS[ent.tier].reportExports !== null) {
    const usageWindow = usageWindowForTier(ent.tier, new Date(), ent.expiresAt)
    const { data: usageRows, error: usageError } = await supabaseAdmin.rpc("avint_claim_report_export", {
      p_user_id: user.id,
      p_report_key: reportKey,
      p_period_start: usageWindow.start,
      p_period_end: usageWindow.end,
      p_limit: PLAN_LIMITS[ent.tier].reportExports,
    })

    if (usageError) {
      return { error: serverError(usageError, { route: "reports/[report]", stage: "report_usage", userId: user.id }) }
    }

    const usage = usageRows?.[0]
    if (!usage?.allowed) {
      return {
        error: NextResponse.json({
          error: "Free includes 1 report export per month. Upgrade to generate another report.",
          code: "REPORT_EXPORT_LIMIT_REACHED",
          used_count: usage?.used_count ?? PLAN_LIMITS[ent.tier].reportExports,
          limit_count: PLAN_LIMITS[ent.tier].reportExports,
        }, { status: 429 }),
      }
    }
  }

  return { user, ent }
}

function accountingCsvResponse(format: "quickbooks" | "xero", rows: any[], filename: string) {
  const csv = format === "quickbooks" ? generateQuickBooksCSV(rows) : generateXeroCSV(rows)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

function getFilters(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return {
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    targetFolder: searchParams.get("targetFolder") ?? "",
  }
}

function getExportFormat(req: NextRequest): string | null {
  return new URL(req.url).searchParams.get("export")
}

async function getFileIds(userId: string, documentTypes: string[], targetFolder: string) {
  let targetFolderIds: string[] = []
  if (targetFolder) {
    const { data: folders, error: folderErr } = await supabaseAdmin
      .from("folders")
      .select("id, parent_id")
      .eq("user_id", userId)

    if (folderErr) throw new Error(folderErr.message)

    const childrenByParent = new Map<string | null, string[]>()
    for (const folder of folders ?? []) {
      const parentId = folder.parent_id ?? null
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), folder.id])
    }

    const queue = [targetFolder]
    const seen = new Set<string>()
    while (queue.length > 0) {
      const folderId = queue.shift()!
      if (seen.has(folderId)) continue
      seen.add(folderId)
      queue.push(...(childrenByParent.get(folderId) ?? []))
    }
    targetFolderIds = Array.from(seen)
  }

  let query = supabaseAdmin
    .from("files")
    .select("id")
    .eq("user_id", userId)

  if (documentTypes.length > 0) {
    query = query.in("document_type", documentTypes)
  }

  if (targetFolderIds.length > 0) query = query.in("folder_id", targetFolderIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params
  const exportFormat = getExportFormat(req)
  const auth = await authorizeReportRequest(req, report, exportFormat)
  if ("error" in auth) return auth.error

  const { user } = auth

  // 30 reports / minute / user — expensive SQL, shouldn't fire on a loop.
  const allowed = await checkRateLimit("reports", user.id, 60, 30)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  const { dateFrom, dateTo, targetFolder } = getFilters(req)

  try {
    switch (report) {
      case "expense-summary": {
        const fileIds = await getFileIds(user.id, ["receipt", "invoice"], targetFolder)
        if (fileIds.length === 0) return NextResponse.json({ expenses: [] })

        let query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, document_date, total_amount,
            currency, expense_category, confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("document_date", dateFrom)
        if (dateTo) query = query.lte("document_date", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)
        return NextResponse.json({ expenses: data ?? [] })
      }

      case "income-summary": {
        const fileIds = await getFileIds(user.id, ["payslip", "income_statement"], targetFolder)
        if (fileIds.length === 0) return NextResponse.json({ income: [] })

        let query = supabaseAdmin
          .from("document_fields")
          .select(`
          file_id, employer_name, document_date,
            gross_income, net_income, total_amount, currency, confidence_score, income_source,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("document_date", dateFrom)
        if (dateTo) query = query.lte("document_date", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)
        return NextResponse.json({ income: data ?? [] })
      }

      case "profit-loss": {
        const incomeFileIds = await getFileIds(user.id, ["payslip", "income_statement"], targetFolder)
        const expenseFileIds = await getFileIds(user.id, ["receipt", "invoice"], targetFolder)

        let incomeRows: unknown[] = []
        let expenseRows: unknown[] = []

        if (incomeFileIds.length > 0) {
          let incomeQuery = supabaseAdmin
            .from("document_fields")
            .select("document_date, gross_income, net_income, total_amount, currency, employer_name, income_source, files!inner(document_type)")
            .in("file_id", incomeFileIds)
            .neq("normalization_status", "excluded")
            .order("document_date", { ascending: true })
          if (dateFrom) incomeQuery = incomeQuery.gte("document_date", dateFrom)
          if (dateTo) incomeQuery = incomeQuery.lte("document_date", dateTo)
          const { data, error } = await incomeQuery
          if (error) throw new Error(error.message)
          incomeRows = data ?? []
        }

        if (expenseFileIds.length > 0) {
          let expenseQuery = supabaseAdmin
            .from("document_fields")
            .select("document_date, total_amount, currency, vendor_name, expense_category, files!inner(document_type)")
            .in("file_id", expenseFileIds)
            .neq("normalization_status", "excluded")
            .order("document_date", { ascending: true })
          if (dateFrom) expenseQuery = expenseQuery.gte("document_date", dateFrom)
          if (dateTo) expenseQuery = expenseQuery.lte("document_date", dateTo)
          const { data, error } = await expenseQuery
          if (error) throw new Error(error.message)
          expenseRows = data ?? []
        }

        return NextResponse.json({ incomeRows, expenseRows })
      }

      case "business-expense": {
        const fileIds = await getFileIds(user.id, ["receipt", "invoice"], targetFolder)
        if (fileIds.length === 0) {
          if (exportFormat) return accountingCsvResponse(exportFormat as "quickbooks" | "xero", [], `business-expense-${exportFormat}.csv`)
          return NextResponse.json({ expenses: [] })
        }

        let query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, document_date, total_amount, currency,
            expense_category, payment_method, tax_amount, confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("document_date", dateFrom)
        if (dateTo) query = query.lte("document_date", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)
        if (exportFormat) {
          const exportRows = (data ?? []).map((row) => ({
            document_date: row.document_date,
            vendor_name: row.vendor_name,
            expense_category: row.expense_category,
            total_amount: row.total_amount,
          }))
          return accountingCsvResponse(exportFormat as "quickbooks" | "xero", exportRows, `business-expense-${exportFormat}.csv`)
        }

        return NextResponse.json({ expenses: data ?? [] })
      }

      case "contract-summary": {
        const fileIds = await getFileIds(user.id, ["contract", "agreement"], targetFolder)
        if (fileIds.length === 0) return NextResponse.json({ contracts: [], obligations: {} })

        const { data: contractRows, error: contractErr } = await supabaseAdmin
          .from("document_fields")
          .select(`
            file_id,
            counterparty_name,
            document_date,
            period_start,
            period_end,
            invoice_number,
            total_amount,
            currency,
            payment_method,
            confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (contractErr) throw new Error(contractErr.message)

        const filteredContracts = (contractRows ?? []).filter((row) =>
          overlapsDateRange(
            {
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            },
            { dateFrom, dateTo },
          ),
        )

        const visibleFileIds = filteredContracts.map((row) => row.file_id)
        if (visibleFileIds.length === 0) return NextResponse.json({ contracts: [], obligations: {} })

        const { data: obligs, error: obligErr } = await supabaseAdmin
          .from("payment_obligations")
          .select("*")
          .in("file_id", visibleFileIds)
          .order("due_date", { ascending: true })

        if (obligErr) throw new Error(obligErr.message)

        const obligations: Record<string, unknown[]> = {}
        for (const row of obligs ?? []) {
          if (!obligations[row.file_id]) obligations[row.file_id] = []
          obligations[row.file_id].push(row)
        }

        return NextResponse.json({ contracts: filteredContracts, obligations })
      }

      case "key-terms": {
        const fileIds = await getFileIds(user.id, ["contract", "agreement"], targetFolder)
        if (fileIds.length === 0) return NextResponse.json({ docs: [] })

        const { data, error } = await supabaseAdmin
          .from("document_fields")
          .select(`
            file_id,
            counterparty_name,
            document_date,
            period_start,
            period_end,
            invoice_number,
            payment_method,
            total_amount,
            currency,
            line_items,
            confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (error) throw new Error(error.message)

        const docs = (data ?? []).filter((row) =>
          overlapsDateRange(
            {
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            },
            { dateFrom, dateTo },
          ),
        )

        return NextResponse.json({ docs })
      }

      case "tax-bundle": {
        const fileIds = await getFileIds(user.id, [], targetFolder)
        const totalOwnedDocs = fileIds.length

        let detectedYears: number[] = []
        let defaultYear: number | null = null
        if (totalOwnedDocs > 0) {
          const { data: yearRows, error: yearErr } = await supabaseAdmin
            .from("document_fields")
            .select("period_start, period_end, document_date, files!inner(user_id, document_type)")
            .eq("files.user_id", user.id)
            .in("file_id", fileIds)
            .neq("normalization_status", "excluded")

          if (yearErr) throw new Error(yearErr.message)

          const years = new Set<number>()
          for (const row of yearRows ?? []) {
            const d = row.period_end ?? row.period_start ?? row.document_date
            if (d && d.length >= 4) years.add(parseInt(d.slice(0, 4), 10))
          }
          detectedYears = Array.from(years).filter((n) => !isNaN(n)).sort((a, b) => b - a)
          defaultYear = selectTaxBundleDefaultYear(
            detectedYears,
            (yearRows ?? []).map((row) => ({
              document_type: row.files?.[0]?.document_type,
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            })),
          )
        }

        if (fileIds.length === 0) {
          if (exportFormat) return accountingCsvResponse(exportFormat as "quickbooks" | "xero", [], `tax-bundle-${exportFormat}.csv`)
          return NextResponse.json({ rows: [], totalOwnedDocs, detectedYears, defaultYear })
        }

        const query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, vendor_normalized, employer_name, document_date,
            period_start, period_end,
            total_amount, gross_income, net_income, expense_category, currency,
            income_source, classification_rationale, jurisdiction,
            confidence_score,
            files!inner(filename, document_type, storage_path)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        const { data, error } = await query
        if (error) throw new Error(error.message)

        const rows = (data ?? []).filter((row) =>
          overlapsDateRange(
            {
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            },
            { dateFrom, dateTo },
          ),
        )

        if (exportFormat) {
          const exportRows = rows
            .filter((row) => ["receipt", "invoice"].includes(row.files?.[0]?.document_type))
            .map((row) => ({
              document_date: row.document_date,
              vendor_name: row.vendor_name,
              expense_category: row.expense_category,
              total_amount: row.total_amount,
            }))
          return accountingCsvResponse(exportFormat as "quickbooks" | "xero", exportRows, `tax-bundle-${exportFormat}.csv`)
        }

        return NextResponse.json({
          rows,
          totalOwnedDocs,
          detectedYears,
          defaultYear,
        })
      }

      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 404 })
    }
  } catch (error) {
    return serverError(error, { route: "reports/[report]", stage: report, userId: user.id })
  }
}
