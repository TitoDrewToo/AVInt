import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

export const metadata = {
  title: "Privacy Policy — AVIntelligence",
  description: "Privacy Policy for AVINTPH INFORMATION TECHNOLOGY SOLUTIONS and AVIntelligence products.",
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Privacy Policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>

          <div className="mt-10 space-y-8 text-sm">

            <p className="text-muted-foreground">
              AVINTPH INFORMATION TECHNOLOGY SOLUTIONS ("AVIntelligence", "we", "us") is a Philippine-registered
              technology company. We build intelligent tools — including Smart Storage and Smart Dashboard — that help
              individuals and businesses structure and analyze real-world documents. This policy explains how we
              collect, use, and protect your information.
            </p>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Information We Collect</h2>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li>Account email address and authentication credentials</li>
                <li>Uploaded files and documents (receipts, invoices, payslips, contracts, etc.)</li>
                <li>Structured data extracted from those documents</li>
                <li>Usage activity — reports generated, dashboards accessed, tools used</li>
                <li>Payment and billing information (processed by Creem or Lemon Squeezy — we do not store card details)</li>
              </ul>
              <p className="text-muted-foreground">We collect only what is necessary to deliver the service. We do not manually review your documents.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">How We Use Your Data</h2>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li>To classify, structure, and store your uploaded documents</li>
                <li>To generate financial reports and power dashboard visualizations</li>
                <li>To manage your account, subscription, and access level</li>
                <li>To improve system accuracy and performance</li>
              </ul>
              <p className="text-muted-foreground">We do not sell your personal data. We do not use your documents for advertising.</p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">AI Processing</h2>
              <p className="text-muted-foreground">
                Document classification and data extraction are performed by automated AI systems powered by OpenAI,
                Anthropic (Claude), and Google Gemini. Processing is programmatic — no human reviews your documents.
                AVIntelligence is an independent product and is not affiliated with or endorsed by these providers.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Infrastructure &amp; Security</h2>
              <p className="text-muted-foreground">Your files and structured data are protected at every layer:</p>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Database &amp; Storage</strong> (SOC 2 Type II) — row-level security enforced. Only your account can access your data.</li>
                <li><strong className="text-foreground">Hosting</strong> (SOC 2 Type II · ISO 27001) — global edge network with DDoS protection and TLS encryption in transit.</li>
                <li><strong className="text-foreground">OpenAI, Anthropic, Google</strong> — enterprise SOC 2 certified AI providers. Document processing is fully automated.</li>
                <li><strong className="text-foreground">Payments</strong> (PCI-DSS compliant) — no card or banking data is stored on our systems.</li>
                <li>Sensitive API keys are never exposed to the client. All document processing runs server-side in isolated edge environments.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Payments</h2>
              <p className="text-muted-foreground">
                Billing is handled by PCI-DSS compliant third-party payment processors. We receive confirmation of
                payment but do not store credit card or banking information. Their respective privacy policies govern
                how payment data is handled.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Data Retention</h2>
              <p className="text-muted-foreground">
                Documents and structured records remain stored until you delete them or request account deletion.
                You may delete individual files at any time from Smart Storage. Account deletion permanently removes
                all stored data associated with your account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Your Rights</h2>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li>Access and download your data</li>
                <li>Delete individual documents or your entire account</li>
                <li>Update your account email or password</li>
                <li>Request clarification on how your data is used</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Contact</h2>
              <p className="text-muted-foreground">
                For privacy-related questions or data requests, contact us at{" "}
                <a href="mailto:support@avintph.com" className="text-primary underline-offset-2 hover:underline">
                  support@avintph.com
                </a>
              </p>
              <p className="text-muted-foreground">AVINTPH INFORMATION TECHNOLOGY SOLUTIONS · Philippines</p>
            </section>

          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
