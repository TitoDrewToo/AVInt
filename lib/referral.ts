import type { AuthChangeEvent, Session } from "@supabase/supabase-js"

import { supabase } from "@/lib/supabase"

const REF_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
const SIGNUP_PENDING_KEY = "avint_referral_signup_pending"
const NEW_ACCOUNT_WINDOW_MS = 72 * 3600 * 1000

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
    localStorage.setItem(SIGNUP_PENDING_KEY, "1")
  } catch {
    // best-effort
  }
}

function clearReferralSignupPending(): void {
  try {
    localStorage.removeItem(SIGNUP_PENDING_KEY)
  } catch {
    // best-effort
  }
}

function isReferralSignupPending(): boolean {
  try {
    return localStorage.getItem(SIGNUP_PENDING_KEY) === "1"
  } catch {
    return false
  }
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
      return
    }
    clearReferralSignupPending()
  } catch (err) {
    console.warn("[referral] unexpected error persisting user_referrals:", err)
  }
}

export async function handleEmailSignupReferral(session: Session | null): Promise<void> {
  if (session?.user?.id) {
    await tryPersistUserReferral(session.user.id)
  }
}

export async function handleAuthSessionReferral(event: AuthChangeEvent, session: Session | null): Promise<void> {
  if (event !== "SIGNED_IN" || !session?.user?.id) return
  if (!isReferralSignupPending()) return

  const createdAt = new Date(session.user.created_at).getTime()
  if (Date.now() - createdAt > NEW_ACCOUNT_WINDOW_MS) return

  await tryPersistUserReferral(session.user.id)
}
