"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GoogleSignInButton } from "@/components/google-sign-in-button"

// Development flag - sync with account-panel.tsx
// Set to true to bypass auth guard
const DEV_FORCE_LOGGED_IN = true

interface AuthGuardModalProps {
  isVisible: boolean
}

export function AuthGuardModal({ isVisible }: AuthGuardModalProps) {
  // Don't show if dev flag is true or if not visible
  if (DEV_FORCE_LOGGED_IN || !isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Blurred backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-md" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground">Sign in required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please sign in to access tools.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          {/* Google SSO */}
          <GoogleSignInButton />

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Email sign in */}
          <div className="space-y-3">
            <Input
              type="email"
              placeholder="Email"
              className="rounded-lg"
            />
            <Input
              type="password"
              placeholder="Password"
              className="rounded-lg"
            />
          </div>
          <Button className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
            Sign in with Email
          </Button>
        </div>
      </div>
    </div>
  )
}

// Export the dev flag for use in pages
export { DEV_FORCE_LOGGED_IN }
