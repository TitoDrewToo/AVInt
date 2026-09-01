import { isStalledUpload, STALLED_UPLOAD_AGE_MS } from "./smart-storage"

export const MAX_BULK_DELETE_FILES = 100

export function validateBulkFileIds(value: unknown): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || !value.length || value.length > MAX_BULK_DELETE_FILES) {
    return { ok: false, error: `file_ids must contain 1-${MAX_BULK_DELETE_FILES} unique ids` }
  }
  if (value.some((id) => typeof id !== "string" || !id) || new Set(value).size !== value.length) {
    return { ok: false, error: `file_ids must contain 1-${MAX_BULK_DELETE_FILES} unique ids` }
  }
  return { ok: true, ids: value }
}

export { isStalledUpload, STALLED_UPLOAD_AGE_MS }
