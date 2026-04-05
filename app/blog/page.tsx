import type { Metadata } from "next"
import Link from "next/link"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ArrowUpRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Blog — AVIntelligence",
  description:
    "Guides, insights, and practical tips on automating document organization, expense tracking, and financial reporting for small businesses and freelancers.",
}

interface BlogPost {
  title: string
  description: string
  slug: string
  date: string
  readTime: string
  tags: string[]
}

const posts: BlogPost[] = [
  {
    title: "How to Automate Receipt Organization for Your Small Business",
    description:
      "Stop sorting receipts manually. Learn a practical system to capture, categorize, and report on business expenses automatically — and why it matters at tax time.",
    slug: "automate-receipt-organization-small-business",
    date: "April 6, 2026",
    readTime: "6 min read",
    tags: ["Receipts", "Automation", "Small Business", "Tax"],
  },
]

export default function BlogIndex() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Blog
          </h1>
          <p className="mt-2 text-muted-foreground">
            Practical guides for organizing documents, tracking expenses, and
            making sense of your financial data.
          </p>

          <div className="mt-12 space-y-8">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/20 hover:shadow-md"
              >
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <time>{post.date}</time>
                  <span>·</span>
                  <span>{post.readTime}</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  {post.description}
                </p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center text-sm font-medium text-primary">
                  Read article
                  <ArrowUpRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
