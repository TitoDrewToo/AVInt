import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StartFreeButton } from "@/components/start-free-button"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"
import { PomelliClip } from "@/components/ui/pomelli-clip"
import { HomeDefaultSphere } from "@/components/home-default-sphere"

export const metadata = {
  title: "Smart Storage — AI Document Storage & Analysis | AVIntelligence",
  description: "Automatically extract and organize data from receipts, invoices, payslips, and contracts. Generate expense, income, tax, and profit & loss reports instantly.",
  openGraph: {
    title: "Smart Storage — AI Document Storage & Analysis | AVIntelligence",
    description: "Automatically extract and organize data from receipts, invoices, payslips, and contracts. Generate expense, income, tax, and profit & loss reports instantly.",
    url: "https://www.avintph.com/products/smart-storage",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart Storage — AI Document Storage & Analysis | AVIntelligence",
    description: "Automatically extract and organize data from receipts, invoices, payslips, and contracts.",
  },
}

// ── Animated capability icons ──────────────────────────────────────────────────

function IconFileSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes fsi-p{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
        .fsi-m{animation:fsi-p 2s ease-in-out infinite;transform-origin:10px 15.5px}
      `}</style>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="11" x2="16" y2="11"/>
      <line x1="8" y1="13.5" x2="12" y2="13.5"/>
      <circle className="fsi-m" cx="10" cy="15.5" r="2.2"/>
      <line x1="11.6" y1="17" x2="14" y2="19.5" strokeWidth="1.8"/>
    </svg>
  )
}

function IconFileText() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes ftx-f{0%,100%{opacity:.15}50%{opacity:1}}
        .ftx-l1{animation:ftx-f 2.2s ease-in-out infinite}
        .ftx-l2{animation:ftx-f 2.2s .45s ease-in-out infinite}
        .ftx-l3{animation:ftx-f 2.2s .9s ease-in-out infinite}
      `}</style>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line className="ftx-l1" x1="8" y1="11" x2="16" y2="11"/>
      <line className="ftx-l2" x1="8" y1="14" x2="16" y2="14"/>
      <line className="ftx-l3" x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  )
}

function IconDatabase() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes dbl-g{0%,100%{opacity:.2}50%{opacity:1}}
        .dbl-1{animation:dbl-g 2.4s ease-in-out infinite}
        .dbl-2{animation:dbl-g 2.4s .6s ease-in-out infinite}
        .dbl-3{animation:dbl-g 2.4s 1.2s ease-in-out infinite}
      `}</style>
      <ellipse className="dbl-1" cx="12" cy="5" rx="9" ry="3"/>
      <path d="M3 5v4c0 1.657 4.03 3 9 3s9-1.343 9-3V5"/>
      <path className="dbl-2" d="M3 9v4c0 1.657 4.03 3 9 3s9-1.343 9-3V9"/>
      <path className="dbl-3" d="M3 13v4c0 1.657 4.03 3 9 3s9-1.343 9-3v-4"/>
    </svg>
  )
}

function IconFileBarChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes fbc-g{0%,100%{transform:scaleY(.2);opacity:.3}55%{transform:scaleY(1);opacity:1}}
        .fbc-b1{animation:fbc-g 2s ease-in-out infinite;transform-origin:9px 18px}
        .fbc-b2{animation:fbc-g 2s .35s ease-in-out infinite;transform-origin:13px 18px}
        .fbc-b3{animation:fbc-g 2s .7s ease-in-out infinite;transform-origin:17px 18px}
      `}</style>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <rect className="fbc-b1" x="7.5" y="13" width="3" height="5" rx="0.5"/>
      <rect className="fbc-b2" x="11.5" y="10" width="3" height="8" rx="0.5"/>
      <rect className="fbc-b3" x="15.5" y="15" width="3" height="3" rx="0.5"/>
    </svg>
  )
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes shld-p{0%{r:5;opacity:.7}100%{r:11;opacity:0}}
        .shld-r{animation:shld-p 2s ease-in-out infinite}
      `}</style>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <circle className="shld-r" cx="12" cy="11" r="5" fill="none" stroke="currentColor" strokeWidth="1"/>
    </svg>
  )
}

function IconFolderOpen() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <style>{`
        @keyframes fo-rise{0%,100%{transform:translateY(3px);opacity:0}40%,60%{transform:translateY(0);opacity:1}}
        .fo-doc{animation:fo-rise 2.4s ease-in-out infinite;transform-origin:12px 15px}
      `}</style>
      <path d="M20 20a2 2 0 002-2V8a2 2 0 00-2-2h-7.9a2 2 0 01-1.69-.9L9.6 3.9A2 2 0 007.93 3H4a2 2 0 00-2 2v13a2 2 0 002 2Z"/>
      <path d="M2 10h20"/>
      <g className="fo-doc">
        <rect x="10" y="13" width="4" height="4.5" rx="0.5" strokeWidth="1.2"/>
        <line x1="11.2" y1="14.5" x2="12.8" y2="14.5" strokeWidth="1"/>
        <line x1="11.2" y1="15.8" x2="12.8" y2="15.8" strokeWidth="1"/>
      </g>
    </svg>
  )
}

// ── Animated workflow icons ────────────────────────────────────────────────────

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <style>{`
        @keyframes upl-mv{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
        @keyframes upl-dot{0%,100%{opacity:1}50%{opacity:.2}}
        .upl-g{animation:upl-mv 2s ease-in-out infinite;transform-origin:12px 11px}
        .upl-d{animation:upl-dot 1.2s ease-in-out infinite}
      `}</style>
      <g className="upl-g">
        <line x1="12" y1="17" x2="12" y2="7"/>
        <polyline points="7 12 12 7 17 12"/>
      </g>
      <line x1="5" y1="20" x2="19" y2="20"/>
      <circle className="upl-d" cx="12" cy="4" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <style>{`
        @keyframes lay-up{0%,100%{transform:translateY(0);opacity:.4}50%{transform:translateY(-2.5px);opacity:1}}
        .lay-1{animation:lay-up 2.2s ease-in-out infinite;transform-origin:12px 8.5px}
        .lay-2{animation:lay-up 2.2s .4s ease-in-out infinite;transform-origin:12px 12px}
        .lay-3{animation:lay-up 2.2s .8s ease-in-out infinite;transform-origin:12px 17px}
      `}</style>
      <polygon className="lay-1" points="12 2 22 8.5 12 15 2 8.5 12 2"/>
      <polyline className="lay-2" points="2 12 12 18.5 22 12"/>
      <polyline className="lay-3" points="2 17 12 23 22 17"/>
    </svg>
  )
}

function IconFileOutput() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <style>{`
        @keyframes fout-a{0%,100%{transform:translateX(0)}50%{transform:translateX(3px)}}
        .fout-arr{animation:fout-a 2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
      `}</style>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="13" y2="13"/>
      <line x1="8" y1="17" x2="11" y2="17"/>
      <g className="fout-arr">
        <line x1="13" y1="13" x2="19" y2="13"/>
        <polyline points="16 10 19 13 16 16"/>
      </g>
    </svg>
  )
}

// ── Data ───────────────────────────────────────────────────────────────────────

const supportedFiles = ["Receipts", "Invoices", "Income records", "Contracts", "Statements"]

const capabilities = [
  { icon: <IconFileSearch />,   title: "Document classification", description: "Automatically identify and categorize document types" },
  { icon: <IconFileText />,     title: "Field extraction",         description: "Pull key data points from unstructured documents" },
  { icon: <IconDatabase />,     title: "Structured datasets",      description: "Convert documents into organized, queryable data" },
  { icon: <IconFileBarChart />, title: "Report generation",        description: "Create summaries and reports from extracted data" },
  { icon: <IconShield />,       title: "Secure storage",           description: "Keep your documents protected and encrypted" },
  { icon: <IconFolderOpen />,   title: "Organized retrieval",      description: "Find and access documents quickly when needed" },
]

const workflowSteps = [
  { icon: <IconUpload />,     title: "Upload documents",             step: "01" },
  { icon: <IconLayers />,     title: "Data becomes structured",      step: "02" },
  { icon: <IconFileOutput />, title: "Reports available when needed", step: "03" },
]

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SmartStorageProductPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0 hidden md:block" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "AVIntelligence Smart Storage",
          "applicationCategory": "FinanceApplication",
          "operatingSystem": "Web",
          "description": "AI-powered financial document storage and analysis. Automatically extracts data from receipts, invoices, payslips, and contracts.",
          "url": "https://www.avintph.com/products/smart-storage",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free tier available"
          }
        })}}
      />
      <Navbar />
      <main className="relative z-[1] flex-1">
        {/* Hero */}
        <section className="relative px-6 py-24 md:py-32">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-40" />
          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
              <div className="text-left">
                <FadeUp>
                  <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                    <span className="text-primary">Structure</span> your real-world documents automatically.
                  </h1>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                    Smart Storage transforms receipts, invoices, and records into organized data ready for reporting and analysis.
                  </p>
                </FadeUp>
                <FadeUp delay={0.18} className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                  <Link href="/pricing">
                    <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                      View Pricing
                    </Button>
                  </Link>
                  <Link href="/products/smart-dashboard">
                    <Button variant="outline" size="lg" className="rounded-xl glass-surface-sm hover:text-primary">
                      Explore Dashboard
                    </Button>
                  </Link>
                </FadeUp>
              </div>
              <FadeUp delay={0.24}>
                <div className="mx-auto w-full max-w-[280px] md:max-w-none">
                  <PomelliClip name="mess-to-data" rounded="rounded-3xl" glow />
                </div>
              </FadeUp>
            </div>
          </div>
        </section>

        {/* What Smart Storage does */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                What Smart Storage does
              </h2>
              <p className="mt-6 text-xl text-foreground md:text-2xl">
                Smart Storage converts everyday documents into structured datasets that can be used for reporting, tracking, and reference.
              </p>
            </FadeUp>

            {/* Supported files */}
            <StaggerContainer className="mt-12 flex flex-wrap items-center justify-center gap-3">
              {supportedFiles.map((file) => (
                <StaggerItem key={file}>
                  <span className="glass-surface-sm rounded-full px-4 py-2 text-sm text-foreground">
                    {file}
                  </span>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Core capabilities */}
        <section className="relative px-6 py-24">
          <div className="relative mx-auto max-w-5xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Core capabilities
              </h2>
            </FadeUp>

            <StaggerContainer className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <StaggerItem key={capability.title}>
                  <div className="group glass-surface hover-bloom rounded-2xl p-6">
                    <div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-lg text-primary transition-all group-hover:[box-shadow:0_0_24px_-4px_var(--retro-glow-red)]">
                      {capability.icon}
                    </div>
                    <h3 className="mt-4 font-medium text-foreground">{capability.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{capability.description}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Workflow simplicity */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Workflow simplicity
              </h2>
            </FadeUp>

            <StaggerContainer className="mt-12 flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-4">
              {workflowSteps.map((step, index) => (
                <StaggerItem key={step.title} className="flex items-center gap-4">
                  <div className="flex flex-col items-center text-center">
                    <div className="glass-surface hover-bloom flex h-16 w-16 items-center justify-center rounded-2xl text-primary">
                      {step.icon}
                    </div>
                    <span className="mt-3 text-xs font-medium text-primary">{step.step}</span>
                    <span className="mt-1 text-sm font-medium text-foreground">{step.title}</span>
                  </div>
                  {index < workflowSteps.length - 1 && (
                    <div className="retro-divider hidden w-16 md:block" />
                  )}
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Infrastructure & Security */}
        <section className="relative px-6 py-24">
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Built on enterprise infrastructure
              </h2>
              <p className="mt-4 text-muted-foreground">
                Your documents are protected at every layer — from upload to storage to processing.
              </p>
            </FadeUp>

            <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {/* Database */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Database & Storage</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">SOC 2 Type II Certified</p>
                  <p className="mt-1 text-xs text-muted-foreground">Row-level security enforced — only your account can access your data, by architecture.</p>
                </div>
              </StaggerItem>

              {/* Hosting */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Hosting</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">SOC 2 Type II · ISO 27001</p>
                  <p className="mt-1 text-xs text-muted-foreground">Global edge network with DDoS protection and TLS encryption enforced end-to-end.</p>
                </div>
              </StaggerItem>

              {/* AI Providers */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Processing</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">OpenAI · Anthropic · Google</p>
                  <p className="mt-1 text-xs text-muted-foreground">Enterprise-grade AI infrastructure. Documents are processed programmatically — no human review.</p>
                </div>
              </StaggerItem>

              {/* Payments */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Payments</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">PCI-DSS Compliant</p>
                  <p className="mt-1 text-xs text-muted-foreground">Payments handled by certified processors. No card data is ever stored on our systems.</p>
                </div>
              </StaggerItem>

              {/* Encryption */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Isolation</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Row-Level Security</p>
                  <p className="mt-1 text-xs text-muted-foreground">Database policies enforced at the row level. No shared data between accounts — by architecture, not policy.</p>
                </div>
              </StaggerItem>

              {/* Access */}
              <StaggerItem>
                <div className="glass-surface hover-bloom rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Access Control</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Auth-gated, server-side only</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sensitive keys never reach the client. All document processing runs server-side in isolated edge environments.</p>
                </div>
              </StaggerItem>

            </StaggerContainer>
          </div>
        </section>

        {/* CTA */}
        <section className="relative px-6 py-24">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <div className="text-left">
              <FadeUp>
                <h2 className="text-balance text-3xl font-semibold leading-[1.1] text-foreground md:text-4xl lg:text-5xl">
                  Upload. <span className="text-primary">Generate.</span>
                </h2>
                <div className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                  <StartFreeButton tool="smart-storage" />
                  <Link href="/pricing">
                    <Button variant="outline" size="lg" className="rounded-xl glass-surface-sm">
                      View Pricing
                    </Button>
                  </Link>
                </div>
              </FadeUp>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
