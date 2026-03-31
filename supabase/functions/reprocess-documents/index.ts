import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const SUPABASE_ANON_KEY         = Deno.env.get("SUPABASE_ANON_KEY")!

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Fetch all document_fields with normalization_status = 'raw' — full row so normalize-document
  // can use the data directly without a second lookup (avoids a known query issue)
  const { data: rawRows, error } = await supabase
    .from("document_fields")
    .select("*")
    .eq("normalization_status", "raw")

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (!rawRows?.length) {
    return new Response(JSON.stringify({ message: "No raw records to process", count: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  console.log(`Reprocessing ${rawRows.length} raw document_fields records`)

  const results: { file_id: string; status: string; error?: string }[] = []

  for (const row of rawRows) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/normalize-document`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ file_id: row.file_id, fields: row }),
      })

      if (res.ok) {
        results.push({ file_id: row.file_id, status: "normalized" })
      } else {
        const errText = await res.text()
        results.push({ file_id: row.file_id, status: "failed", error: errText })
      }
    } catch (err: any) {
      results.push({ file_id: row.file_id, status: "error", error: err.message })
    }
  }

  const succeeded = results.filter((r) => r.status === "normalized").length
  const failed    = results.filter((r) => r.status !== "normalized").length

  console.log(`Done: ${succeeded} normalized, ${failed} failed`)

  return new Response(
    JSON.stringify({ total: rawRows.length, succeeded, failed, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  )
})
