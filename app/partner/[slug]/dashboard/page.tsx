import { notFound } from "next/navigation"
import { Footer } from "@/components/footer"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { FirmDashboard } from "./dashboard-client"

export const dynamic = "force-dynamic"

export default async function FirmDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: firm } = await supabaseAdmin.from("firms").select("name, status").eq("slug", slug).maybeSingle()
  if (!firm || firm.status !== "active") notFound()
  return <div className="relative flex min-h-screen flex-col"><HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" /><Navbar /><main className="relative z-[1] flex-1 px-6 py-24"><div className="mx-auto max-w-6xl"><p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Firm dashboard</p><h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">{firm.name}</h1><p className="mt-4 text-lg text-muted-foreground">Manage client seats and retrieve organized outputs.</p><div className="mt-12"><FirmDashboard slug={slug} /></div></div></main><Footer /></div>
}
