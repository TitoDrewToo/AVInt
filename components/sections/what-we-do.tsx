import { FadeUp } from "@/components/fade-up"

export function WhatWeDoSection() {
  return (
    <section className="border-t border-border bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-3xl text-center">
        <FadeUp>
          <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
            What AVIntelligence builds
          </h2>
        </FadeUp>
        <FadeUp delay={0.1} className="mt-8 space-y-6">
          <p className="text-balance text-xl text-foreground md:text-2xl">
            AVIntelligence develops intelligent tools that structure information from real-world documents and workflows.
          </p>
          <p className="text-muted-foreground">
            Our systems transform files and activity into structured data that powers dashboards, reports, and decision-making.
          </p>
        </FadeUp>
      </div>
    </section>
  )
}
