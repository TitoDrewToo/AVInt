"use client"

import type { ReactElement } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

export function Tip({ children, text }: { children: ReactElement; text: string }) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={6}>{text}</TooltipContent>
    </Tooltip>
  )
}

export { TooltipProvider }
