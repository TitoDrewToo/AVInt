import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

serve(async (req) => {
  try {
    const { file_id, job_id } = await req.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // 1. Get raw extracted fields
    const { data: fields, error: fieldsError } = await supabase
      .from("document_fields")
      .select("*")
      .eq("file_id", file_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (fieldsError || !fields) throw new Error("document_fields not found")

    // 2. Call OpenAI to normalize
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You are a data normalization AI. You receive raw extracted document fields and return cleaned, normalized versions.

Return ONLY a valid JSON object with no markdown, no explanation.

Normalize:
- vendor_name: clean company name, remove store numbers, standardize capitalization
- employer_name: clean employer name
- document_date: ensure ISO format YYYY-MM-DD
- expense_category: one of Food, Transport, Utilities, Healthcare, Entertainment, Shopping, Travel, Office, Salary, Tax, Legal, Other
- currency: ISO 4217 code (USD, PHP, SGD, etc)
- all amounts: ensure they are numbers

Return the same fields you receive, normalized.`
          },
          {
            role: "user",
            content: JSON.stringify({
              vendor_name: fields.vendor_name,
              employer_name: fields.employer_name,
              document_date: fields.document_date,
              currency: fields.currency,
              total_amount: fields.total_amount,
              gross_income: fields.gross_income,
              net_income: fields.net_income,
              expense_category: fields.expense_category,
              raw_json: fields.raw_json,
            })
          }
        ],
        max_tokens: 512,
      })
    })

    if (!openaiResponse.ok) {
      const err = await openaiResponse.text()
      throw new Error(`OpenAI API error: ${err}`)
    }

    const openaiData = await openaiResponse.json()
    const rawText = openaiData.choices?.[0]?.message?.content

    if (!rawText) throw new Error("No response from OpenAI")

    let normalized: any
    try {
      const cleaned = rawText.replace(/```json|```/g, "").trim()
      normalized = JSON.parse(cleaned)
    } catch {
      throw new Error(`Failed to parse OpenAI output: ${rawText}`)
    }

    // 3. Update document_fields with normalized values
    await supabase
      .from("document_fields")
      .update({
        vendor_name: normalized.vendor_name ?? fields.vendor_name,
        employer_name: normalized.employer_name ?? fields.employer_name,
        document_date: normalized.document_date ?? fields.document_date,
        currency: normalized.currency ?? fields.currency,
        total_amount: normalized.total_amount ?? fields.total_amount,
        gross_income: normalized.gross_income ?? fields.gross_income,
        net_income: normalized.net_income ?? fields.net_income,
        expense_category: normalized.expense_category ?? fields.expense_category,
      })
      .eq("id", fields.id)

    // 4. Mark job as completed
    await supabase
      .from("processing_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job_id)

    return new Response(JSON.stringify({ success: true, file_id }), {
      headers: { "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("normalize-document error:", error)

    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      if (req.body) {
        const { job_id } = await req.json().catch(() => ({}))
        if (job_id) {
          await supabase
            .from("processing_jobs")
            .update({ status: "failed", error_message: error.message })
            .eq("id", job_id)
        }
      }
    } catch {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
