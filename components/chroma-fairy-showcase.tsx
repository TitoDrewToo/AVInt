"use client"

import { ArrowUpRight } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel"

const previews = [
  {
    type: "live" as const,
    eyebrow: "Live sample · homepage",
    title: "A gallery that moves like a painting.",
    src: "https://www.chromafairy.com/",
    href: "https://www.chromafairy.com/",
    frameTitle: "Chroma Fairy homepage live sample",
  },
  {
    type: "shop" as const,
    eyebrow: "Storefront · /shop",
    title: "The work has somewhere to go.",
  },
  {
    type: "studio" as const,
    eyebrow: "Operations · /studio",
    title: "A quiet studio behind the public gallery.",
  },
]

export function ChromaFairyShowcase() {
  const [api, setApi] = useState<CarouselApi>()
  const [selectedIndex, setSelectedIndex] = useState(0)

  const onSelect = useCallback((carouselApi: CarouselApi) => {
    if (!carouselApi) return
    setSelectedIndex(carouselApi.selectedScrollSnap())
  }, [])

  useEffect(() => {
    if (!api) return
    onSelect(api)
    api.on("select", onSelect)
    api.on("reInit", onSelect)
    return () => {
      api.off("select", onSelect)
      api.off("reInit", onSelect)
    }
  }, [api, onSelect])

  return (
    <div className="relative mx-auto w-full max-w-[720px] md:mx-0">
      <div className="mb-4 flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{previews[selectedIndex].eyebrow}</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{previews[selectedIndex].title}</p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">0{selectedIndex + 1} / 0{previews.length}</span>
      </div>

      <Carousel
        className="group/showcase"
        opts={{ loop: false, align: "start" }}
        setApi={setApi}
      >
        <CarouselContent className="-ml-5">
          {previews.map((preview) => (
            <CarouselItem key={preview.eyebrow} className="pl-5">
              <article className="glass-surface overflow-hidden rounded-[2rem] border-primary/20 p-2 shadow-[0_28px_100px_-42px_var(--retro-glow-red)]">
                <div className="relative aspect-[16/10] overflow-hidden rounded-[1.6rem] bg-black/30">
                  {preview.type === "live" ? (
                    <iframe
                      className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[1440px] origin-center rounded-[1.6rem] border-0"
                      src={preview.src}
                      title={preview.frameTitle}
                      loading="lazy"
                      style={{ transform: "translate(-50%, -50%) scale(0.46)" }}
                    />
                  ) : <StaticPreview type={preview.type} />}
                  <div className="pointer-events-none absolute inset-0 rounded-[1.6rem] ring-1 ring-inset ring-white/15" />
                  {preview.type === "live" ? <a href={preview.href} target="_blank" rel="noopener noreferrer" className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-xs font-medium text-white backdrop-blur-md transition-colors hover:bg-black/75">Open preview<ArrowUpRight className="h-3.5 w-3.5" /></a> : null}
                </div>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious aria-label="Previous Chroma Fairy preview" className="left-3 z-10 border-white/20 bg-black/55 text-white hover:bg-black/75 hover:text-white md:-left-5" />
        <CarouselNext aria-label="Next Chroma Fairy preview" className="right-3 z-10 border-white/20 bg-black/55 text-white hover:bg-black/75 hover:text-white md:-right-5" />
      </Carousel>

      <div className="mt-5 flex items-center justify-center gap-2" aria-label="Chroma Fairy preview slides">
          {previews.map((preview, index) => (
          <button
            key={preview.eyebrow}
            type="button"
            aria-label={`Show ${preview.eyebrow}`}
            aria-current={selectedIndex === index ? "true" : undefined}
            onClick={() => api?.scrollTo(index)}
            className={`h-1.5 rounded-full transition-all ${selectedIndex === index ? "w-9 bg-primary" : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/65"}`}
          />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Swipe, use the arrows, or press ← →</p>
    </div>
  )
}

function StaticPreview({ type }: { type: "shop" | "studio" }) {
  if (type === "shop") {
    return (
      <div className="absolute inset-0 bg-[#f4efe7] p-5 text-[#192c35] sm:p-8">
        <div className="flex items-center justify-between border-b border-[#192c35]/15 pb-4 text-[9px] uppercase tracking-[0.22em]"><span className="font-semibold tracking-[0.28em]">Chroma Fairy</span><span>Shop · About · Contact</span></div>
        <div className="mt-7 flex items-end justify-between gap-4"><div><p className="text-[9px] uppercase tracking-[0.25em] text-[#b35d55]">Original works</p><h3 className="mt-2 font-serif text-2xl sm:text-4xl">Find your flow.</h3></div><span className="rounded-full border border-[#192c35]/20 px-3 py-1 text-[9px] uppercase tracking-[0.18em]">Browse all</span></div>
        <div className="mt-7 grid grid-cols-3 gap-3">{["linear-gradient(145deg, #143d52, #e6b16b 58%, #f2e9d6)", "linear-gradient(145deg, #b85d57, #e6c16f 55%, #173d4a)", "linear-gradient(145deg, #174f62, #8cc5bf 55%, #f4e8d2)"].map((background, index) => <div key={background} className="overflow-hidden rounded-xl border border-[#192c35]/10 bg-white/55"><div className="aspect-[4/5]" style={{ background }} /><div className="p-2"><p className="text-[8px] uppercase tracking-[0.12em]">{["Tidal Memory", "Soft Current", "After Rain"][index]}</p><p className="mt-1 text-[8px] text-[#192c35]/55">Original · PHP ———</p></div></div>)}</div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 bg-[#10252e] p-5 text-[#f4efe7] sm:p-8">
      <div className="flex h-full gap-5"><aside className="hidden w-24 shrink-0 border-r border-white/10 pr-4 sm:block"><div className="text-[9px] font-semibold uppercase tracking-[0.22em]">Chroma<br />Fairy</div><div className="mt-12 space-y-4 text-[8px] uppercase tracking-[0.16em] text-white/45"><p className="text-[#e4b36c]">Overview</p><p>Catalogue</p><p>Inquiries</p><p>Schedule</p></div></aside><div className="min-w-0 flex-1"><div className="flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-[8px] uppercase tracking-[0.2em] text-[#e4b36c]">Studio workspace</p><h3 className="mt-1 font-serif text-2xl sm:text-3xl">Good morning, Samantha.</h3></div><span className="h-7 w-7 rounded-full bg-[#d77765]/70" /></div><div className="mt-5 grid grid-cols-3 gap-2">{[["Works", "24"], ["Inquiries", "08"], ["This month", "06"]].map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3"><p className="text-[8px] uppercase tracking-wider text-white/45">{label}</p><p className="mt-2 text-xl">{value}</p></div>)}</div><div className="mt-5 rounded-lg border border-white/10 bg-[#193945] p-3"><p className="text-[8px] uppercase tracking-wider text-white/45">Recent catalogue</p><div className="mt-3 grid grid-cols-4 gap-2">{["linear-gradient(135deg, #d77765, #e5b465)", "linear-gradient(135deg, #246b78, #d5e6dc)", "linear-gradient(135deg, #b4605c, #1a3740)", "linear-gradient(135deg, #d7b968, #315e6a)"].map((background) => <div key={background} className="aspect-square rounded-md" style={{ background }} />)}</div></div></div></div>
    </div>
  )
}
