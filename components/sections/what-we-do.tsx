import { FadeUp } from "@/components/fade-up"
import { PomelliClip } from "@/components/ui/pomelli-clip"

export function WhatWeDoSection() {
  return (
    <section className="relative px-6 py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-40" />
      <div className="relative mx-auto max-w-6xl">
        <div className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
          {/* Left column — enlarged, left-aligned copy */}
          <div className="text-left">
            <FadeUp>
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                What AVIntelligence builds
              </h2>
            </FadeUp>
            <FadeUp delay={0.1} className="mt-8 space-y-6">
              <p className="text-balance font-sans text-4xl font-semibold leading-[1.1] text-foreground md:text-5xl lg:text-6xl">
                AVIntelligence develops{" "}
                <span className="text-primary">intelligent</span> tools{" "}
                that structure information from real-world documents and workflows.
              </p>
              <p className="max-w-xl text-base text-muted-foreground md:text-lg">
                Our systems transform files and activity into structured data that powers dashboards, reports, and decision-making.
              </p>
            </FadeUp>
          </div>

          {/* Right column — Pomelli clip, sized to remaining space */}
          <FadeUp delay={0.2}>
            <div className="mx-auto w-full max-w-[280px] md:max-w-none">
              <PomelliClip name="extract-data" rounded="rounded-3xl" />
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}
