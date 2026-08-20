import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function keyFromEnvironment(value: string) {
  const key = Buffer.from(value, "base64")
  if (key.length !== 32) throw new Error("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
  return key
}

export function encryptGoogleDriveToken(token: string, keyValue: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromEnvironment(keyValue), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".")
}

export function decryptGoogleDriveToken(payload: string, keyValue: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".")
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) throw new Error("Invalid encrypted Google Drive token")
  const decipher = createDecipheriv("aes-256-gcm", keyFromEnvironment(keyValue), Buffer.from(ivEncoded, "base64url"))
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"))
  return Buffer.concat([decipher.update(Buffer.from(encryptedEncoded, "base64url")), decipher.final()]).toString("utf8")
}
