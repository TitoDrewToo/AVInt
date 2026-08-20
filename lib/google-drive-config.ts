const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

export function googleDriveConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey,
    scope: DRIVE_SCOPE,
    enabled: Boolean(clientId && clientSecret && redirectUri && encryptionKey),
  }
}

export function googleDriveUnavailableMessage() {
  return "Google Drive import is being configured. Please try again later."
}
