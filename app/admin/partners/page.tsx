import type { Metadata } from "next"
import { Footer } from "@/components/footer"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { Navbar } from "@/components/navbar"
import { PartnerAdminConsole } from "./partner-admin-console"

export const metadata: Metadata = { title: "Partner Admin Console | AVIntelligence", robots: { index: false, follow: false } }

export default function PartnerAdminPage() {
  return <div className="relative flex min-h-screen flex-col"><HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" /><Navbar /><main className="relative z-[1] flex-1 px-6 py-24"><div className="mx-auto max-w-6xl"><p className="text-sm font-medium uppercase tracking-[0.22em] text-primary">Internal operations</p><h1 className="mt-5 text-4xl font-semibold tracking-tight text-foreground md:text-6xl">Partner channel console.</h1><p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">Manage inbound leads, provision firms, and keep an eye on seat capacity.</p><div className="mt-12"><PartnerAdminConsole /></div></div></main><Footer /></div>
}
