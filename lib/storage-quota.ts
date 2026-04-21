export const GIB = 1024 * 1024 * 1024
export const TIB = 1024 * GIB

export const FREE_STORAGE_BYTES = 5 * GIB
export const MONTHLY_PRO_STORAGE_BYTES = 1 * TIB
export const ANNUAL_PRO_STORAGE_BYTES = 2 * TIB

export type StorageQuotaPlan = {
  status?: string | null
  plan?: string | null
  isPro?: boolean
}

export function storageQuotaBytes(plan: StorageQuotaPlan | null | undefined) {
  if (plan?.status === "pro" || plan?.isPro) {
    return plan.plan === "annual" ? ANNUAL_PRO_STORAGE_BYTES : MONTHLY_PRO_STORAGE_BYTES
  }
  return FREE_STORAGE_BYTES
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < GIB) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes < TIB) return `${(bytes / GIB).toFixed(1)} GB`
  return `${(bytes / TIB).toFixed(1)} TB`
}

export function formatStorageAllowance(bytes: number): string {
  if (bytes >= TIB) return `${Math.round(bytes / TIB)} TB`
  return `${Math.round(bytes / GIB)} GB`
}

export function storageUsagePercent(usedBytes: number, allowanceBytes: number) {
  if (allowanceBytes <= 0) return 0
  return Math.min(100, Math.max(0, (usedBytes / allowanceBytes) * 100))
}
