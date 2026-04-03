"use client"

import { useState, useEffect } from "react"
import { Copy, Check as CheckIcon, ExternalLink } from "lucide-react"

interface InAppInfo {
  name: string
  isIOS: boolean
  isAndroid: boolean
}

function detectInAppBrowser(): InAppInfo | null {
  if (typeof navigator === "undefined") return null
  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod/i.test(ua)
  const isAndroid = /Android/i.test(ua)

  let name: string | null = null
  if (/FBAN|FBAV|FBIOS/i.test(ua)) name = "Facebook / Messenger"
  else if (/Instagram/i.test(ua)) name = "Instagram"
  else if (/Twitter/i.test(ua)) name = "Twitter"
  else if (/LinkedInApp/i.test(ua)) name = "LinkedIn"
  else if (/Snapchat/i.test(ua)) name = "Snapchat"
  else if (/TikTok/i.test(ua)) name = "TikTok"
  else if (/Line\//i.test(ua)) name = "Line"
  else if (/\bwv\b/i.test(ua) && isAndroid) name = "an in-app browser"

  if (!name) return null
  return { name, isIOS, isAndroid }
}

export function InAppBrowserBanner() {
  const [info, setInfo] = useState<InAppInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setInfo(detectInAppBrowser())
  }, [])

  if (!info) return null

  const handleCopy = () => {
    navigator.clipboard.writeText("https://www.avintph.com").then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const steps = info.isIOS
    ? [
        'Tap the share icon (↑) or "…" at the bottom of this browser',
        'Select "Open in Safari" or "Open in Chrome"',
        "Sign in from there",
      ]
    : [
        'Tap the "⋮" menu at the top right',
        'Select "Open in Chrome" or "Open in browser"',
        "Sign in from there",
      ]

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-amber-400">
            You&apos;re inside {info.name}&apos;s browser
          </p>
          <p className="mt-1 text-xs text-amber-400/80">
            Google sign-in is blocked in in-app browsers by Google&apos;s policy. To sign in:
          </p>
          <ol className="mt-2 space-y-1">
            {steps.map((step, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-amber-400/80">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-500/40 text-[10px] font-bold text-amber-400">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
          <button
            onClick={handleCopy}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400 transition-colors hover:bg-amber-500/20 active:scale-95"
          >
            {copied ? <CheckIcon className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied! Paste in Safari / Chrome" : "Copy link — avintph.com"}
          </button>
        </div>
      </div>
    </div>
  )
}
