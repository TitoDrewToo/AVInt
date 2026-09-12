export class UploadBodyTooLargeError extends Error {
  constructor() { super("Upload request exceeds the total size limit") }
}

/** Bound bytes before multipart parsing, including chunked/misreported bodies. */
export async function boundedFormData(request: Request, maximumBytes: number): Promise<FormData> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) throw new Error("Invalid upload body limit")
  const declared = request.headers.get("content-length")
  if (declared && /^\d+$/.test(declared) && Number(declared) > maximumBytes) {
    await request.body?.cancel().catch(() => {})
    throw new UploadBodyTooLargeError()
  }
  const reader = request.body?.getReader()
  if (!reader) throw new Error("Missing upload body")
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maximumBytes) {
        await reader.cancel().catch(() => {})
        throw new UploadBodyTooLargeError()
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  chunks.length = 0
  return new Response(body, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData()
}
