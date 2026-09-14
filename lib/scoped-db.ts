import { supabaseAdmin } from "@/lib/mcp-auth"

type QueryBuilder = any

/**
 * Owner-scoped service-role client. The owner is the data owner, not
 * necessarily the authenticated caller (firm-admin exports may delegate).
 */
export function scopedDb(ownerUserId: string) {
  if (!ownerUserId) throw new Error("Owner user id is required")
  const scoped = (table: string, reason?: string): QueryBuilder => {
    if (reason !== undefined && !reason.trim()) throw new Error(`Unscoped access to ${table} requires a reason`)
    const builder = supabaseAdmin.from(table)
    if (reason !== undefined) return builder
    return new Proxy(builder, {
      get(target, property, receiver) {
        if (property === "select") {
          return (...args: unknown[]) => Reflect.apply(target.select, target, args).eq("user_id", ownerUserId)
        }
        if (property === "update" || property === "delete") {
          return (...args: unknown[]) => (Reflect.apply((target as any)[property], target, args) as any).eq("user_id", ownerUserId)
        }
        if (property === "insert" || property === "upsert") {
          return (values: any, ...args: unknown[]) => {
            const withOwner = Array.isArray(values)
              ? values.map((value) => ({ ...value, user_id: ownerUserId }))
              : { ...values, user_id: ownerUserId }
            return Reflect.apply((target as any)[property], target, [withOwner, ...args])
          }
        }
        return Reflect.get(target, property, receiver)
      },
    })
  }
  return {
    from: (table: string) => scoped(table),
    unscoped: (table: string, reason: string) => scoped(table, reason),
    rpc: (...args: any[]) => (supabaseAdmin.rpc as any)(...args),
  }
}
