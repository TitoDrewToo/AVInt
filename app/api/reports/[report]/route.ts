import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/subscription"
import { overlapsDateRange } from "@/lib/report-utils"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authorizeReportRequest(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token)
  if (authErr || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }

  const { data: subRow, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("status, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle()

  if (subErr) {
    return { error: NextResponse.json({ error: subErr.message }, { status: 500 }) }
  }

  const ent = computeEntitlement(subRow)
  if (!ent.isActive) {
    return { error: NextResponse.json({ error: "Active premium access required" }, { status: 403 }) }
  }

  return { user }
}

function getFilters(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return {
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    targetFolder: searchParams.get("targetFolder") ?? "",
  }
}

async function getFileIds(userId: string, documentTypes: string[], targetFolder: string) {
  let query = supabaseAdmin
    .from("files")
    .select("id")
    .eq("user_id", userId)

  if (documentTypes.length > 0) {
    query = query.in("document_type", documentTypes)
  }

  if (targetFolder) query = query.eq("folder_id", targetFolder)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.id)
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params
  const auth = await authorizeReportRequest(req)
  if ("error" in auth) return auth.error

  const { user } = auth
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
            gross_income, net_income, total_amount, currency, confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
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
            .select("document_date, gross_income, net_income, total_amount, currency, employer_name, files!inner(document_type)")
            .in("file_id", incomeFileIds)
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
        if (fileIds.length === 0) return NextResponse.json({ expenses: [] })

        let query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, document_date, total_amount, currency,
            expense_category, payment_method, tax_amount, confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("document_date", dateFrom)
        if (dateTo) query = query.lte("document_date", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)
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
        if (totalOwnedDocs > 0) {
          const { data: yearRows, error: yearErr } = await supabaseAdmin
            .from("document_fields")
            .select("period_start, period_end, document_date, files!inner(user_id)")
            .eq("files.user_id", user.id)

          if (yearErr) throw new Error(yearErr.message)

          const years = new Set<number>()
          for (const row of yearRows ?? []) {
            const d = row.period_end ?? row.period_start ?? row.document_date
            if (d && d.length >= 4) years.add(parseInt(d.slice(0, 4), 10))
          }
          detectedYears = Array.from(years).filter((n) => !isNaN(n)).sort((a, b) => b - a)
        }

        if (fileIds.length === 0) {
          return NextResponse.json({ rows: [], totalOwnedDocs, detectedYears })
        }

        let query = supabaseAdmin
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
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("period_end", dateFrom)
        if (dateTo) query = query.lte("period_start", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)

        return NextResponse.json({
          rows: data ?? [],
          totalOwnedDocs,
          detectedYears,
        })
      }

      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 404 })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load report data"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
