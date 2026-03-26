"use client"

type SystemStatus = "operational" | "degraded"

interface SystemStatusIndicatorProps {
  status?: SystemStatus
}

export function SystemStatusIndicator({ status = "operational" }: SystemStatusIndicatorProps) {
  const colorClass = status === "operational" ? "bg-green-500" : "bg-blue-500"
  const tooltipText = status === "operational" ? "Operational" : "Service disruption detected"

  return (
    <span 
      className="relative flex h-2 w-2 cursor-default" 
      title={tooltipText}
    >
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colorClass} opacity-50`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${colorClass}`} />
    </span>
  )
}
