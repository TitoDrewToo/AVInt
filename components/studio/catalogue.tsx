"use client"

import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { useEffect, useRef } from "react"
import { getStudioAssets, studioReadout, studioSections, type StudioAsset, type StudioStatus } from "@/components/studio/registry"
import { StudioMotionToggle, StudioPaletteSwitcher, StudioThemeProvider, useStudioTheme } from "@/components/studio/studio-theme"

function statusLabel(status: StudioStatus) {
  return status
}

function ReferenceFrame({ asset }: { asset: StudioAsset }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const { palette, motion } = useStudioTheme()
  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const send = () => frame.contentWindow?.postMessage({ studioChrome: "off", studioPalette: palette, studioMotion: motion ? "on" : "off" }, location.origin)
    const resize = (event: MessageEvent) => { if (event.source === frame.contentWindow && event.data?.studioHeight) frame.style.height = `${Math.max(320, event.data.studioHeight)}px` }
    window.addEventListener("message", resize)
    send()
    return () => window.removeEventListener("message", resize)
  }, [motion, palette])
  return <iframe ref={ref} title={`${asset.title} reference`} loading="lazy" src={asset.referencePath} onLoad={() => ref.current?.contentWindow?.postMessage({ studioChrome: "off", studioPalette: palette, studioMotion: motion ? "on" : "off" }, location.origin)} className="block min-h-[320px] w-full border-0" />
}

function NativeStage({ asset }: { asset: StudioAsset }) {
  if (!asset.component) return <div className="flex min-h-[320px] items-center justify-center bg-[var(--surface-2)] p-8 text-center text-sm text-[var(--text-dim)]">{asset.description}</div>
  const Component = asset.component
  return <div className="flex min-h-[320px] items-center justify-center bg-[var(--surface)] p-8"><Component /></div>
}

function StudioCard({ asset }: { asset: StudioAsset }) {
  return <article id={`studio-${asset.id}`} className={`overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] ${asset.wide ? "md:col-span-2" : ""}`}><header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4"><h3 className="font-[var(--font-display)] text-lg font-bold text-[var(--text)]">{asset.title}</h3><span data-status={asset.status} className="shrink-0 border border-[var(--line)] px-2 py-1 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-dim)]">{statusLabel(asset.status)}</span></header><div className={asset.status === "Planned" ? "min-h-[320px] bg-[var(--surface-2)]/50 p-5" : "min-h-[320px]"}>{asset.status === "Reference" || asset.status === "Ad hoc" ? <ReferenceFrame asset={asset} /> : asset.status === "Built" ? <NativeStage asset={asset} /> : <div className="flex min-h-[320px] items-center justify-center p-8 text-center text-sm text-[var(--text-dim)]">{asset.description}</div>}</div><footer className="space-y-2 border-t border-[var(--line)] px-5 py-4"><p className="text-sm text-[var(--text-dim)]">{asset.usage}</p>{asset.importPath ? <button type="button" onClick={() => void navigator.clipboard?.writeText(asset.importPath ?? "")} className="block max-w-full break-all text-left font-[var(--font-mono)] text-xs text-[var(--brand)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{asset.importPath}</button> : <span className="block font-[var(--font-mono)] text-xs text-[var(--text-dim)]">{asset.status === "Reference" || asset.status === "Ad hoc" ? "Static reference · public/studio-reference" : "No import path yet"}</span>}{asset.referencePath ? <Link href={asset.referencePath} target="_blank" className="inline-flex items-center gap-1 text-xs text-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Open reference <ArrowUpRight className="h-3.5 w-3.5" /></Link> : null}</footer></article>
}

function CatalogueBody({ section }: { section?: string }) {
  const selected = section ? studioSections.find((item) => item.id === section) : null
  const sections = selected ? [selected] : studioSections
  const readout = studioReadout()
  const { motion } = useStudioTheme()
  useEffect(() => { document.querySelectorAll<HTMLIFrameElement>("iframe[title$='reference']").forEach((frame) => frame.contentWindow?.postMessage({ studioMotion: motion ? "on" : "off" }, location.origin)) }, [motion])
  return <div data-motion={motion ? "on" : "off"} className="space-y-8">
    <section className="border-b border-[var(--line)] pb-8"><p className="font-[var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--brand)]">Brand-agnostic component library</p><h2 className="mt-3 max-w-4xl font-[var(--font-display)] text-4xl font-bold tracking-tight md:text-6xl">Systems without the studio’s skin.</h2><p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--text-dim)]">The grammar transfers. The brand stays yours.</p><p className="mt-6 font-[var(--font-mono)] text-xs text-[var(--text-dim)]">{readout.Built} built · {readout.Reference} reference · {readout.Planned} planned · {readout["Ad hoc"]} ad hoc</p></section>
    <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-4 border border-[var(--line)] bg-[var(--surface)]/95 p-3 backdrop-blur"><StudioPaletteSwitcher /><StudioMotionToggle /><nav aria-label="Studio library sections" className="flex flex-wrap gap-2">{studioSections.map((item) => <Link key={item.id} href={`/systems/studio/${item.id}`} className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{item.label}</Link>)}</nav></div>
    {sections.map((item) => <section key={item.id} aria-labelledby={`studio-${item.id}`}><div className="mb-5"><p className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--brand)]">Library section</p><h2 id={`studio-${item.id}`} className="mt-2 font-[var(--font-display)] text-3xl font-bold text-[var(--text)]">{item.label}</h2><p className="mt-2 text-sm text-[var(--text-dim)]">{item.description}</p></div><div className="grid gap-5 md:grid-cols-2">{getStudioAssets(item.id).map((asset) => <StudioCard key={asset.id} asset={asset} />)}</div></section>)}
  </div>
}

export function StudioCatalogue({ section }: { section?: string }) {
  return <StudioThemeProvider><CatalogueBody section={section} /></StudioThemeProvider>
}
