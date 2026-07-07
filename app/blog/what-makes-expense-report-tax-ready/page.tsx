import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ArrowLeft } from "lucide-react"

export const metadata: Metadata = {
  title:
    "What Makes an Expense Report \"Tax-Ready\" (and Why Yours Probably Isn't) — AVIntelligence",
  description:
    "A folder of receipts and a spreadsheet isn't the same as a tax-ready expense report. Learn the five things a tax-ready report needs — and the gap that costs freelancers money every year.",
  keywords: [
    "tax-ready expense report",
    "expense report for taxes",
    "freelancer profit and loss",
    "schedule c expense report",
    "1099 expense tracking",
    "self-employed expense report",
    "categorize business expenses",
    "tax preparation freelancer",
    "expense summary report",
    "small business tax deductions",
  ],
  openGraph: {
    title: "What Makes an Expense Report \"Tax-Ready\" (and Why Yours Probably Isn't)",
    description:
      "A folder of receipts and a spreadsheet isn't the same as a tax-ready expense report. Learn the five things a tax-ready report needs.",
    type: "article",
    publishedTime: "2026-07-07T00:00:00Z",
    authors: ["AVIntelligence"],
  },
}

function Section({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold text-foreground">{heading}</h2>
      <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function ArticlePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-16">
        <article className="mx-auto max-w-2xl">
          {/* Back link */}
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-2 rounded-lg px-3 py-2 -ml-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            All articles
          </Link>

          {/* Header */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <time dateTime="2026-07-07">July 7, 2026</time>
            <span>·</span>
            <span>5 min read</span>
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground leading-tight">
            What Makes an Expense Report &quot;Tax-Ready&quot; (and Why Yours
            Probably Isn&apos;t)
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Plenty of freelancers think they&apos;re organized because they have
            a folder of receipts and a spreadsheet. Then tax season arrives, they
            open that spreadsheet, and realize it answers almost none of the
            questions their accountant is about to ask.
          </p>

          <Section heading="&quot;Tax-ready&quot; has a specific definition">
            <p>An expense report is tax-ready when it is:</p>
            <ul className="ml-5 list-disc space-y-2">
              <li>
                <strong className="text-foreground">Categorized</strong> — every
                expense sorted into the buckets that matter (meals, travel,
                software, equipment, home office), not one long undifferentiated
                list.
              </li>
              <li>
                <strong className="text-foreground">Totaled</strong> — each
                category summed, so you can see at a glance what you spent where.
              </li>
              <li>
                <strong className="text-foreground">Complete</strong> — income
                and expenses together, giving you a real picture of profit, not
                just a pile of costs.
              </li>
              <li>
                <strong className="text-foreground">
                  Backed by source documents
                </strong>{" "}
                — every number traceable to the actual receipt or invoice behind
                it, in case you&apos;re ever asked.
              </li>
              <li>
                <strong className="text-foreground">Exportable</strong> — in a
                form you, your accountant, or your tax software can actually use.
              </li>
            </ul>
            <p>
              A shoebox of receipts is none of these. A spreadsheet you filled in
              by hand is maybe the first two, if you were disciplined all year —
              and most people weren&apos;t.
            </p>
          </Section>

          <Section heading="Why the gap costs you real money">
            <p>
              When your records aren&apos;t tax-ready, three things happen, and
              all three cost you:
            </p>
            <ol className="ml-5 list-decimal space-y-3">
              <li>
                <strong className="text-foreground">You miss deductions.</strong>{" "}
                Expenses you can&apos;t find, can&apos;t categorize, or forgot to
                log simply don&apos;t get claimed. Every missed deduction is tax
                you didn&apos;t have to pay.
              </li>
              <li>
                <strong className="text-foreground">You scramble.</strong> The
                last-minute reconstruction of a whole year&apos;s spending is
                stressful, error-prone, and eats days you could spend earning.
              </li>
              <li>
                <strong className="text-foreground">You&apos;re exposed.</strong>{" "}
                If a number can&apos;t be traced to a document, it&apos;s a weak
                spot. Tax-ready records mean every figure has proof behind it.
              </li>
            </ol>
            <p>
              The irony is that the information was there all along — in your
              receipts and invoices. It just never got turned into something
              usable.
            </p>
          </Section>

          <Section heading="What tax-ready looks like in practice">
            <p>
              Imagine opening one report that shows: total income for the year,
              expenses grouped and totaled by category, a clean profit figure,
              and every line traceable back to the original document — all
              exportable in a click. No hunting, no rebuilding, no guesswork.
              That&apos;s the difference between dreading tax season and closing
              it in an afternoon.
            </p>
          </Section>

          <Section heading="Getting there without the manual work">
            <p>
              The reason most freelancers don&apos;t have tax-ready reports is
              simple: producing them by hand is tedious. That&apos;s the part
              AVIntelligence automates.
            </p>
            <p>
              You upload your documents — receipts, invoices, payslips, contracts
              — and the AI extracts the fields, amounts, dates, and categories,
              then generates the structured reports and dashboards for you:
              spending by category, income vs. expense, and summaries ready to
              hand to a tax preparer. The source document sits behind every
              number. What used to be a weekend of spreadsheet work becomes a
              report you can pull on demand.
            </p>
          </Section>

          {/* CTA */}
          <div className="mt-12 rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <h3 className="text-lg font-semibold text-foreground">
              See your first tax-ready report
            </h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Upload a few documents free and watch AVIntelligence structure them
              on your dashboard. When you want the full tax-ready reports,
              advanced dashboards, and 1 TB of storage, Pro is $12/month.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <Link
                href="/"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Try it free →
              </Link>
              <Link
                href="/products/smart-storage"
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Learn more
              </Link>
            </div>
          </div>

          <p className="mt-8 text-xs text-muted-foreground leading-relaxed">
            This article is general information for education, not tax advice.
            Rules vary by situation and change over time — check with a qualified
            tax professional about your specific circumstances.
          </p>

          {/* Schema.org Article structured data */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "Article",
                headline:
                  "What Makes an Expense Report Tax-Ready (and Why Yours Probably Isn't)",
                description:
                  "A folder of receipts and a spreadsheet isn't the same as a tax-ready expense report. Learn the five things a tax-ready report needs.",
                datePublished: "2026-07-07T00:00:00Z",
                author: {
                  "@type": "Organization",
                  name: "AVIntelligence",
                  url: "https://www.avintph.com",
                },
                publisher: {
                  "@type": "Organization",
                  name: "AVIntelligence",
                  url: "https://www.avintph.com",
                },
              }),
            }}
          />
        </article>
      </main>
      <Footer />
    </div>
  )
}
