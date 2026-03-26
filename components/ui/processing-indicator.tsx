"use client"

interface ProcessingIndicatorProps {
  active: boolean
}

export function ProcessingIndicator({ active }: ProcessingIndicatorProps) {
  if (!active) return null

  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
    </span>
  )
}
