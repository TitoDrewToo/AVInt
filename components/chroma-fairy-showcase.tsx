"use client"

import Image from "next/image"
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
    frameTitle: "Chroma Fairy homepage live sample",
  },
  {
    type: "shop" as const,
    eyebrow: "Storefront · /shop",
    title: "The work has somewhere to go.",
    src: "/shop.png",
    alt: "Chroma Fairy shop screenshot",
  },
  {
    type: "studio" as const,
    eyebrow: "Operations · /studio",
    title: "A quiet studio behind the public gallery.",
    src: "/studio.png",
    alt: "Chroma Fairy studio screenshot with email masked",
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
        data-sphere-ignore
        opts={{ loop: false, align: "start" }}
        setApi={setApi}
      >
        <CarouselContent className="-ml-5">
          {previews.map((preview) => (
            <CarouselItem key={preview.eyebrow} className="pl-5">
              <article className="glass-surface overflow-hidden rounded-[2rem] border-primary/20 p-2 shadow-[0_28px_100px_-42px_var(--retro-glow-red)]">
                <div className={`relative overflow-hidden rounded-[1.6rem] bg-black/30 ${preview.type === "studio" ? "aspect-[2.52]" : "aspect-[16/10]"}`}>
                  {preview.type === "live" ? (
                    <iframe
                      className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[1440px] origin-center rounded-[1.6rem] border-0"
                      src={preview.src}
                      title={preview.frameTitle}
                      loading="lazy"
                      style={{ transform: "translate(-50%, -50%) scale(0.46)" }}
                    />
                  ) : <Image fill className="bg-[#f5f2ec] object-contain object-center" sizes="(min-width: 768px) 55vw, 92vw" src={preview.src} alt={preview.alt} />}
                  <div className="pointer-events-none absolute inset-0 rounded-[1.6rem] ring-1 ring-inset ring-white/15" />
                </div>
              </article>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious aria-label="Previous Chroma Fairy preview" className="chroma-carousel-control left-3 z-10 md:-left-5" />
        <CarouselNext aria-label="Next Chroma Fairy preview" className="chroma-carousel-control right-3 z-10 md:-right-5" />
      </Carousel>

      <div className="mt-5 flex items-center justify-center gap-2" aria-label="Chroma Fairy preview slides">
          {previews.map((preview, index) => (
          <button
            key={preview.eyebrow}
            type="button"
            aria-label={`Show ${preview.eyebrow}`}
            aria-current={selectedIndex === index ? "true" : undefined}
            onClick={() => api?.scrollTo(index)}
            className={`chroma-carousel-dot h-1.5 rounded-full transition-all ${selectedIndex === index ? "w-9 bg-primary" : "w-1.5 bg-muted-foreground/35 hover:bg-muted-foreground/65"}`}
          />
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">Swipe, use the arrows, or press ← →</p>
    </div>
  )
}
