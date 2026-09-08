import { supabaseAdmin } from "@/lib/mcp-auth"

export async function recordSecurityAdminAudit(input: {
  actorUserId?: string | null
  action: string
  fileId?: string | null
  correlationId?: string | null
  metadata?: Record<string, string | number | boolean | null>
}) {
  const { error } = await supabaseAdmin.from("prescan_admin_audit_events").insert({
    actor_user_id: input.actorUserId ?? null,
    action: input.action,
    file_id: input.fileId ?? null,
    correlation_id: input.correlationId ?? null,
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Security administrator audit failed: ${error.message}`)
}
