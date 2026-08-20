import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { decryptGoogleDriveToken, encryptGoogleDriveToken } from "@/lib/google-drive-crypto"
import { googleDriveConfig } from "@/lib/google-drive-config"

const STATE_COOKIE = "avint_google_drive_state"
const STATE_TTL_SECONDS = 10 * 60
const DRIVE_FILE_FIELDS = "id,name,mimeType,size,modifiedTime,webViewLink,parents"
const DRIVE_FILES_FIELDS = `files(${DRIVE_FILE_FIELDS}),nextPageToken`
const FOLDER_MIME = "application/vnd.google-apps.folder"
const ALLOWED_MIME = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic",
  "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
])
const MAX_FILE_BYTES = 50 * 1024 * 1024

type DriveTokenResponse = { access_token: string; expires_in: number; refresh_token?: string }
export type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; parents?: string[] }

type RequiredDriveConfig = { clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string; pickerApiKey?: string; appId?: string; pickerEnabled?: boolean; scope: string; enabled: true }

function configOrThrow(): RequiredDriveConfig {
  const config = googleDriveConfig()
  if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri || !config.encryptionKey) throw new Error("Google Drive integration is not configured")
  return { ...config, clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri, encryptionKey: config.encryptionKey, enabled: true }
}

function signState(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

export function createGoogleDriveAuthorizationUrl(userId: string) {
  const config = configOrThrow()
  const nonce = randomBytes(24).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ userId, nonce, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS })).toString("base64url")
  const state = `${payload}.${signState(payload, config.encryptionKey)}`
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", access_type: "offline", prompt: "consent", scope: `openid email profile ${config.scope}`, state }).toString()}`, nonce }
}

export async function setGoogleDriveStateCookie(nonce: string) {
  const jar = await cookies()
  jar.set(STATE_COOKIE, nonce, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: STATE_TTL_SECONDS, path: "/api/integrations/google-drive" })
}

function parseState(state: string) {
  const config = configOrThrow()
  const [payload, signature] = state.split(".")
  if (!payload || !signature) throw new Error("Invalid Google Drive OAuth state")
  const expected = Buffer.from(signState(payload, config.encryptionKey))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error("Invalid Google Drive OAuth state")
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; nonce?: string; exp?: number }
  if (!parsed.userId || !parsed.nonce || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error("Expired Google Drive OAuth state")
  return parsed as { userId: string; nonce: string; exp: number }
}

export async function exchangeGoogleDriveCode(code: string, state: string) {
  const parsed = parseState(state)
  const jar = await cookies()
  const cookieNonce = jar.get(STATE_COOKIE)?.value
  jar.delete(STATE_COOKIE)
  if (!cookieNonce || cookieNonce !== parsed.nonce) throw new Error("Google Drive OAuth session mismatch")
  const config = configOrThrow()
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) })
  if (!response.ok) throw new Error("Google Drive authorization could not be completed")
  const token = await response.json() as DriveTokenResponse
  if (!token.access_token) throw new Error("Google Drive did not return an access token")
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } })
  const profile = profileResponse.ok ? await profileResponse.json() as { sub?: string; email?: string } : {}
  if (!profile.sub) throw new Error("Google account identity could not be verified")
  if (!token.refresh_token) {
    const existing = await supabaseAdmin.from("google_drive_connections").select("encrypted_refresh_token").eq("user_id", parsed.userId).maybeSingle()
    if (existing.data?.encrypted_refresh_token) token.refresh_token = decryptGoogleDriveToken(existing.data.encrypted_refresh_token, config.encryptionKey)
  }
  if (!token.refresh_token) throw new Error("Google did not return a refresh token; reconnect and approve access")
  const { error } = await supabaseAdmin.from("google_drive_connections").upsert({ user_id: parsed.userId, google_subject: profile.sub, google_email: profile.email ?? null, encrypted_refresh_token: encryptGoogleDriveToken(token.refresh_token, config.encryptionKey), access_token_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw new Error(error.message)
  return parsed.userId
}

async function accessTokenForUser(userId: string) {
  const config = configOrThrow()
  const { data: connection, error } = await supabaseAdmin.from("google_drive_connections").select("encrypted_refresh_token").eq("user_id", userId).maybeSingle()
  if (error || !connection) throw new Error("Google Drive is not connected")
  const refreshToken = decryptGoogleDriveToken(connection.encrypted_refresh_token, config.encryptionKey)
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) })
  if (!response.ok) throw new Error("Google Drive authorization expired; please reconnect")
  const token = await response.json() as DriveTokenResponse
  return token.access_token
}

export async function listGoogleDriveFiles(userId: string, parentId?: string) {
  const accessToken = await accessTokenForUser(userId)
  const q = parentId ? `'${parentId}' in parents and trashed = false` : "trashed = false"
  const response = await fetch(`https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, pageSize: "100", orderBy: "folder,name", fields: DRIVE_FILES_FIELDS, spaces: "drive" })}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error("Google Drive files could not be loaded")
  return await response.json() as { files?: DriveFile[]; nextPageToken?: string }
}

async function getDriveFile(userId: string, fileId: string) {
  const accessToken = await accessTokenForUser(userId)
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${new URLSearchParams({ fields: DRIVE_FILE_FIELDS, alt: "json" })}`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!response.ok) throw new Error(`Google Drive metadata request failed (${response.status})`)
  return { accessToken, file: await response.json() as DriveFile }
}

async function expandDriveSelection(userId: string, ids: string[], depth = 0): Promise<DriveFile[]> {
  if (depth > 2 || ids.length > 25) throw new Error("Drive selection is too large; choose up to 25 files or folders")
  const expanded: DriveFile[] = []
  for (const id of ids) {
    const { file } = await getDriveFile(userId, id)
    if (file.mimeType === FOLDER_MIME) {
      const children = await listGoogleDriveFiles(userId, id)
      expanded.push(...await expandDriveSelection(userId, (children.files ?? []).map((child) => child.id), depth + 1))
    } else expanded.push(file)
  }
  return expanded
}

export async function downloadGoogleDriveSelection(userId: string, ids: string[]) {
  const files = await expandDriveSelection(userId, ids)
  if (files.length > 25) throw new Error("Drive selection contains too many files")
  const downloaded: Array<{ file: DriveFile; data: string; mimeType: string }> = []
  for (const file of files) {
    if (!ALLOWED_MIME.has(file.mimeType)) continue
    const declaredSize = Number(file.size ?? 0)
    if (declaredSize > MAX_FILE_BYTES) continue
    const { accessToken } = await getDriveFile(userId, file.id)
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!response.ok) throw new Error(`Google Drive file download failed (${response.status})`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_FILE_BYTES) continue
    downloaded.push({ file, data: `data:${file.mimeType};base64,${bytes.toString("base64")}`, mimeType: file.mimeType })
  }
  return downloaded
}

export async function getGoogleDriveUser(userId: string) {
  const { data, error } = await supabaseAdmin.from("google_drive_connections").select("google_email").eq("user_id", userId).maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function getGoogleDrivePickerConfig(userId: string) {
  const config = configOrThrow()
  if (!config.pickerEnabled || !config.pickerApiKey || !config.appId) throw new Error("Google Drive Picker is not configured")
  const connection = await getGoogleDriveUser(userId)
  if (!connection) throw new Error("Google Drive is not connected")
  return { accessToken: await accessTokenForUser(userId), apiKey: config.pickerApiKey, appId: config.appId }
}
