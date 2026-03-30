"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function StartFreeButton({ tool }: { tool: "smart-storage" | "smart-dashboard" }) {
  return (
    <Link href={`/tools/${tool}`}>
      <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
        Start Free
      </Button>
    </Link>
  )
}
