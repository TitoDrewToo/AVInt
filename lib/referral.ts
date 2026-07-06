import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

const REF_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const SIGNUP_PENDING_KEY = "avint_referral_signup_pending"
const NEW_USER_WINDOW_MS = 120_000

export function getRef(): string | null {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)avint_ref=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  try {
    return localStorage.getItem("avint_ref")
  } catch {
    return null
  }
}

export function captureRefFromUrl(): void {
  if (typeof window === "undefined") return
  const ref = new URLSearchParams(window.location.search).get("ref")
  if (!ref || !REF_PATTERN.test(ref)) return

  const expires = new Date(Date.now() + 60 * 864e5).toUTCString()
  document.cookie = `avint_ref=${encodeURIComponent(ref)}; expires=${expires}; path=/; SameSite=Lax`
  try {
    localStorage.setItem("avint_ref", ref)
  } catch {
    // best-effort localStorage fallback
  }
}

export function markReferralSignupPending(): void {
  try {
    sessionStorage.setItem(SIGNUP_PENDING_KEY, "1")
  } catch {
    // best-effort
  }
}

function clearReferralSignupPending(): void {
  try {
    sessionStorage.removeItem(SIGNUP_PENDING_KEY)
  } catch {
    // best-effort
  }
}

function isReferralSignupPending(): boolean {
  try {
    return sessionStorage.getItem(SIGNUP_PENDING_KEY) === "1"
  } catch {
    return false
  }
}

function isLikelyNewAuthUser(createdAt: string, lastSignInAt?: string | null): boolean {
  const created = new Date(createdAt).getTime()
  const lastSignIn = lastSignInAt ? new Date(lastSignInAt).getTime() : created
  return Math.abs(lastSignIn - created) < NEW_USER_WINDOW_MS
}

export async function tryPersistUserReferral(userId: string): Promise<void> {
  const ref = getRef()
  if (!ref) return

  try {
    const { error } = await supabase
      .from("user_referrals")
      .upsert({ user_id: userId, partner_code: ref }, { onConflict: "user_id", ignoreDuplicates: true })

    if (error) {
      console.warn("[referral] failed to persist user_referrals:", error.message)
    }
  } catch (err) {
    console.warn("[referral] unexpected error persisting user_referrals:", err)
  }
}

export async function handleEmailSignupReferral(session: Session | null): Promise<void> {
  markReferralSignupPending()
  if (session?.user?.id) {
    await tryPersistUserReferral(session.user.id)
    clearReferralSignupPending()
  }
}

export async function handleAuthSessionReferral(event: AuthChangeEvent, session: Session | null): Promise<void> {
  if (event !== "SIGNED_IN" || !session?.user?.id) return

  const pending = isReferralSignupPending()
  const isNew = isLikelyNewAuthUser(session.user.created_at, session.user.last_sign_in_at)
  if (!pending && !isNew) return

  await tryPersistUserReferral(session.user.id)
  clearReferralSignupPending()
}
