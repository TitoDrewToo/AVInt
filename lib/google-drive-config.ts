const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly"

export function googleDriveConfig() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI
  const encryptionKey = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY
  const pickerApiKey = process.env.GOOGLE_DRIVE_PICKER_API_KEY
  const appId = process.env.GOOGLE_DRIVE_PROJECT_NUMBER
  return {
    clientId,
    clientSecret,
    redirectUri,
    encryptionKey,
    pickerApiKey,
    appId,
    scope: DRIVE_SCOPE,
    enabled: Boolean(clientId && clientSecret && redirectUri && encryptionKey),
    pickerEnabled: Boolean(pickerApiKey && appId),
  }
}

export function googleDriveUnavailableMessage() {
  return "Google Drive import is being configured. Please try again later."
}
