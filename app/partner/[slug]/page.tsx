import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { FirmIntake } from "./firm-intake"

export const dynamic = "force-dynamic"

async function getFirm(slug: string) {
  const { data, error } = await supabaseAdmin.from("firms").select("id, name, slug, logo_url, status").eq("slug", slug).maybeSingle()
  if (error || !data || data.status !== "active") return null
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const firm = await getFirm(slug)
  return { title: firm ? `Upload receipts for ${firm.name} | Smart Storage` : "Firm intake | Smart Storage", robots: { index: false, follow: false } }
}

export default async function FirmIntakePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const firm = await getFirm(slug)
  if (!firm) notFound()

  return <div className="relative flex min-h-screen flex-col"><HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" /><Navbar /><main className="relative z-[1] flex flex-1 items-center px-6 py-24"><div className="mx-auto grid w-full max-w-5xl items-center gap-12 md:grid-cols-[0.9fr_1.1fr]"><div><p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">{firm.name}</p><h1 className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">Upload your receipts for {firm.name}.</h1><p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Your firm has invited you to use Smart Storage to organize incoming documents and prepare structured output for review.</p>{firm.logo_url ? <img src={firm.logo_url} alt={`${firm.name} logo`} className="mt-8 max-h-14 max-w-56 object-contain object-left" /> : null}</div><FirmIntake slug={firm.slug} firmName={firm.name} /></div></main><Footer /></div>
}
