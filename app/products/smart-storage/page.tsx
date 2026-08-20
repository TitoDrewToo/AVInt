import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { StartFreeButton } from "@/components/start-free-button"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"
import { PomelliClip } from "@/components/ui/pomelli-clip"
import { HomeDefaultSphere } from "@/components/home-default-sphere"
import { SampleReportsSection } from "@/components/sections/sample-reports"
import { PrivacySecuritySection } from "@/components/sections/privacy-security"
import { ChevronDown } from "lucide-react"

export const metadata = {
  title: "Smart Storage — Clean Expense Reports from Your Documents | AVIntelligence",
  description: "Extract vendors, dates, amounts, categories, and recurring expenses from receipts and invoices into searchable records and exportable reports. Import from Google Drive and use it through Claude.",
  openGraph: {
    title: "Smart Storage — Clean Expense Reports from Your Documents | AVIntelligence",
    description: "Extract vendors, dates, amounts, categories, and recurring expenses from receipts and invoices into searchable records and exportable reports. Import from Google Drive and use it through Claude.",
    url: "https://www.avintph.com/products/smart-storage",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart Storage — Clean Expense Reports from Your Documents | AVIntelligence",
    description: "Extract vendors, dates, amounts, categories, and recurring expenses from receipts and invoices. Import from Google Drive and use it through Claude.",
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
  { icon: <IconShield />,       title: "Secure storage",           description: "Keep documents account-isolated and access-controlled" },
  { icon: <IconFolderOpen />,   title: "Organized retrieval",      description: "Find and access documents quickly when needed" },
]

const workflowSteps = [
  { icon: <IconUpload />,     title: "Upload",                            step: "01" },
  { icon: <IconLayers />,     title: "AI extracts & categorizes",         step: "02" },
  { icon: <IconFileOutput />, title: "Export an accountant-ready report", step: "03" },
]

const smartStorageFaq = [
  {
    question: "What does Smart Storage actually do?",
    answer: `Upload receipts, invoices, payslips, statements, and contracts, and Smart Storage turns them into clean structured records — vendor, date, amount, category — and then into reports you can actually use. No manual data entry, no spreadsheets.`,
  },
  {
    question: "What can I upload?",
    answer: `Receipts, invoices, payslips, income and bank statements, transaction records, and contracts — as PDF, photo (JPG/PNG/HEIC/WEBP), CSV, or Excel, up to 60 MB each. Snap a photo of a receipt or drop in a whole spreadsheet; both work.`,
  },
  {
    question: "Can I import files from Google Drive?",
    answer: `Yes. Connect Google Drive from the Smart Storage workspace, open the folder you want in Google’s native picker, and select your files. They enter the same security scan, extraction, normalization, and reporting workflow as regular uploads.`,
  },
  {
    question: "What reports do I get?",
    answer: `Seven, all built from your own documents: Expense Summary, Income Summary, Profit & Loss, Business Expense, Contract Summary, Key Terms, and a Schedule C–style Tax Bundle. Every one is exportable.`,
  },
  {
    question: "Can I export to QuickBooks or Xero?",
    answer: `Yes — Smart Storage generates import-ready files for QuickBooks (3- and 4-column) and Xero, so your bookkeeping tool gets clean data without manual entry. (These are files you import; live two-way sync is on the roadmap.)`,
  },
  {
    question: "Why subscribe instead of staying on Free?",
    answer: `Free is for trying it out — 10 documents a month. Paid plans unlock the parts that actually save time: unlimited report exports, QuickBooks/Xero export, advanced analytics and custom dashboards, recurring-expense detection, priority processing — and the Claude connector. If you handle more than a handful of documents a month, it pays for itself in the data entry you stop doing.`,
  },
  {
    question: "What is the Claude connector — and why is it a big deal?",
    answer: `It connects Smart Storage directly to Claude, so your books become something you can just talk to. Instead of opening dashboards and clicking through exports, you ask — "run my tax bundle for 2025" or "give me a QuickBooks export for this quarter" — and Claude does it against your own account, right in the chat. It turns a multi-step workflow into a single sentence.`,
  },
  {
    question: "What can I actually do from inside Claude?",
    answer: `Three things, all on your own documents: add new documents to Smart Storage, run your Tax Bundle and Business Expense reports, and generate an import-ready QuickBooks or Xero file — without leaving the conversation. Your other reports and full dashboards live in the web app.`,
  },
  {
    question: "Why use Smart Storage if I can just upload files to Claude directly?",
    answer: `Because Smart Storage is where your records live — organized, extracted, and always current. Upload a document once and it stays; you never re-upload, re-search, or re-explain your history each session. Claude then works off that structured, up-to-date store on demand. Files dropped into a one-off chat disappear when it closes — Smart Storage is the memory and structure that makes every future question, and every report, instant. Using both is the point: Smart Storage remembers and organizes; Claude acts on it.`,
  },
  {
    question: "Do I need to be technical to connect Claude?",
    answer: `No. In Claude you choose "Add custom connector," paste one URL, and sign in with the email on your AVIntelligence account. No keys, no code, no setup — about a minute.`,
  },
  {
    question: "Which plan do I need for the Claude connector?",
    answer: `Pro or Business. It's included with both.`,
  },
  {
    question: "Is my data private and secure?",
    answer: `Yes. Each account's documents are isolated at the database level, processing runs server-side, and the Claude connection uses secure OAuth sign-in — AVIntelligence never sees your password, and the connector only ever touches your own account. Reports and exports through Claude are read-only. Built on SOC 2 Type II-certified infrastructure.`,
  },
  {
    question: "What if I have expenses in more than one currency?",
    answer: `Your dashboards handle multiple currencies. The Tax Bundle is intentionally USD-only for filing accuracy — any non-USD items are listed separately so nothing gets silently mixed into your totals.`,
  },
  {
    question: "How accurate is the extraction, and what if something's off?",
    answer: `High-confidence items flow straight through; anything uncertain is flagged for you to review and reclassify, so a questionable line never quietly lands in a report. You always keep control of the final numbers.`,
  },
  {
    question: "Is this tax advice or a replacement for my accountant?",
    answer: `No — and we're deliberate about that. Smart Storage organizes your records and hands your accountant a clean, Schedule C–style starting point. It's built to save you both hours, not to replace a licensed preparer. Always confirm filings with a professional.`,
  },
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
      <main className="marketing-scroll-stage relative z-[1] flex flex-1 flex-col">
        {/* Hero */}
        <section className="marketing-hero-section marketing-hero-section-spacious relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-40" />
          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-10 md:grid-cols-[1.6fr_1fr] md:gap-16">
              <div className="text-left">
                <FadeUp>
                  <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-6xl">
                    Stop sorting receipts manually. Upload your documents and get a clean expense <span className="text-primary">report in minutes.</span>
                  </h1>
                </FadeUp>
                <FadeUp delay={0.1}>
                  <p className="mt-6 max-w-xl text-lg text-muted-foreground">
                    Extract vendors, dates, amounts, categories, and recurring expenses from receipts and invoices into searchable records and exportable reports.
                  </p>
                </FadeUp>
                <FadeUp delay={0.18} className="mt-10 flex flex-col items-start gap-4 sm:flex-row">
                  <Link href="/tools/smart-storage">
                    <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">
                      Start free
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
        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
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
        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-5xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Core capabilities
              </h2>
            </FadeUp>

            <StaggerContainer className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((capability) => (
                <StaggerItem key={capability.title} className="h-full">
                  <div className="group glass-surface hover-bloom h-full rounded-2xl p-6">
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
        <section className="marketing-scroll-section marketing-scroll-section-centered relative px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Workflow simplicity
              </h2>
            </FadeUp>

            <StaggerContainer className="mt-12 flex flex-col items-center gap-8 md:flex-row md:justify-center md:gap-4">
              {workflowSteps.map((step, index) => (
                <StaggerItem
                  key={step.title}
                  className="flex items-center gap-4"
                >
                  <div
                    className={`flex flex-col items-center text-center ${
                      index === 1 ? "workflow-middle-step" : ""
                    }`}
                  >
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

        {/* Report outcomes */}
        <SampleReportsSection />

        {/* Privacy and security */}
        <PrivacySecuritySection />

        {/* Accounting exports */}
        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">Works with QuickBooks &amp; Xero</h2>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                Export your organized expenses as import-ready files for QuickBooks and Xero, or hand your accountant a clean Schedule C bundle.
              </p>
            </FadeUp>
          </div>
        </section>

        {/* Claude connector */}
        <section className="marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-5xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">Now works inside Claude</h2>
              <h3 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Your Smart Storage, now operable from Claude.</h3>
              <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
                Bring files in from Google Drive, keep them organized in Smart Storage, then connect it to Claude and run the workflow in plain language — pull your Schedule C tax bundle and get back an import-ready QuickBooks or Xero file, without opening the dashboard. It works securely on your own account and it&apos;s included with Pro.
              </p>
            </FadeUp>

            <StaggerContainer className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { icon: <IconFileText />, title: "Report", body: "Ask for your Tax Bundle or Business Expense report and get the numbers back in chat — straight from the documents already in Smart Storage." },
                { icon: <IconFileOutput />, title: "Export", body: "Generate an import-ready QuickBooks or Xero file — same workflow, either platform — without leaving the conversation." },
                { icon: <IconUpload />, title: "File (bonus)", body: "Have a new receipt? Drop it into the chat and Claude files it into Smart Storage, classified and extracted." },
              ].map((item) => (
                <StaggerItem key={item.title} className="h-full">
                  <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">{item.icon}</div>
                    <h4 className="mt-5 text-base font-semibold text-foreground">{item.title}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  </div>
                </StaggerItem>
              ))}
            </StaggerContainer>

            <FadeUp className="mt-10 text-center">
              <Link href="/tools/smart-storage/connect">
                <Button size="lg" className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90">Connect to Claude</Button>
              </Link>
              <p className="mt-3 text-xs text-muted-foreground">Pro &amp; Business plans. Secure OAuth sign-in — AVIntelligence never sees your password.</p>
            </FadeUp>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="order-2 marketing-scroll-section relative scroll-mt-24 px-6">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
          <div className="relative mx-auto max-w-3xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">FAQ</h2>
              <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">Questions, answered.</p>
            </FadeUp>

            <StaggerContainer className="mt-10 space-y-3">
              {smartStorageFaq.map((item) => (
                <StaggerItem key={item.question}>
                  <details className="group glass-surface-sm hover-bloom rounded-xl border border-border/60 p-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-medium text-foreground [&::-webkit-details-marker]:hidden">
                      <span>{item.question}</span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
                  </details>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </div>
        </section>

        {/* Infrastructure & Security */}
        <section className="order-1 marketing-scroll-section relative px-6">
          <div className="relative mx-auto max-w-4xl">
            <FadeUp className="text-center">
              <h2 className="text-sm font-medium uppercase tracking-wider text-primary">
                Built on enterprise infrastructure
              </h2>
              <p className="mt-4 text-muted-foreground">
                Smart Storage keeps financial documents account-isolated, screened before processing, and handled by server-side systems.
              </p>
            </FadeUp>

            <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

              {/* Database */}
              <StaggerItem className="h-full">
                <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Database & Storage</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Built on SOC 2 Type II-certified infrastructure</p>
                  <p className="mt-1 text-xs text-muted-foreground">Account-level access controls keep each user's files and structured records separated.</p>
                </div>
              </StaggerItem>

              {/* Upload Safety */}
              <StaggerItem className="h-full">
                <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Upload Screening</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Checked before processing</p>
                  <p className="mt-1 text-xs text-muted-foreground">Uploaded documents pass file-type and safety checks before they become report-ready records.</p>
                </div>
              </StaggerItem>

              {/* AI Providers */}
              <StaggerItem className="h-full">
                <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">AI Processing</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">OpenAI · Anthropic · Google</p>
                  <p className="mt-1 text-xs text-muted-foreground">Documents are processed programmatically for extraction, classification, and reporting — no manual review.</p>
                </div>
              </StaggerItem>

              {/* Smart Security */}
              <StaggerItem className="h-full">
                <div id="smart-security" className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Smart Security</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">A defensive ingestion layer built into Smart Storage</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Uploads enter a controlled screening path before extraction. Files are checked for type, structure, and content safety, while documents that need attention can be isolated rather than sent deeper into the workflow.</p>
                </div>
              </StaggerItem>

              {/* Data Isolation */}
              <StaggerItem className="h-full">
                <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data Isolation</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Row-Level Security</p>
                  <p className="mt-1 text-xs text-muted-foreground">Database policies are enforced at the row level so account data stays separated by design.</p>
                </div>
              </StaggerItem>

              {/* Access */}
              <StaggerItem className="h-full">
                <div className="glass-surface hover-bloom h-full rounded-2xl p-5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Access Control</span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">Auth-gated, server-side only</p>
                  <p className="mt-1 text-xs text-muted-foreground">Sensitive keys never reach the client. Document processing runs through server-side systems.</p>
                </div>
              </StaggerItem>

            </StaggerContainer>
          </div>
        </section>

        {/* CTA */}
        <section className="order-3 marketing-scroll-section relative px-6">
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
