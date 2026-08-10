import { WorkOS } from "@workos-inc/node"

let client: WorkOS | null = null

export function getWorkOSClient() {
  const apiKey = process.env.WORKOS_API_KEY
  if (!apiKey) return null
  if (!client) {
    client = new WorkOS({ apiKey, clientId: process.env.WORKOS_CLIENT_ID })
  }
  return client
}
