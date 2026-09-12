/** Trusted reprocess callers must first claim the file through the app route. */
export function processingStateAllowed(status: string, reprocess: boolean, serviceRole: boolean): boolean {
  return reprocess ? serviceRole && status === "processing" : status === "approved"
}
