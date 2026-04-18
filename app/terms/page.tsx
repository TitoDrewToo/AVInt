import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

export const metadata = {
  title: "Terms of Service — AVIntelligence",
  description: "Terms of Service for AVINTPH INFORMATION TECHNOLOGY SOLUTIONS and AVIntelligence products.",
}

export default function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: April 2026</p>

          <div className="mt-10 space-y-8 text-sm">

            <p className="text-muted-foreground">
              By creating an account or using AVIntelligence products, you agree to these Terms of Service.
              These terms apply to all users of avintph.com and associated tools.
            </p>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">About AVIntelligence</h2>
              <p className="text-muted-foreground">
                AVIntelligence is a product of AVINTPH INFORMATION TECHNOLOGY SOLUTIONS, a Philippines-registered
                technology company. We develop intelligent tools — Smart Storage and Smart Dashboard — that help
                individuals and businesses structure, store, and visualize information from real-world documents.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Use of Service</h2>
              <p className="text-muted-foreground">
                AVIntelligence provides document processing and data visualization tools for personal and business use.
                Generated reports and structured data are reference outputs — they do not constitute financial, legal,
                tax, or professional advice. You are responsible for verifying outputs before acting on them.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Account Responsibility</h2>
              <p className="text-muted-foreground">
                You are responsible for maintaining the security of your account credentials. Do not share access
                with unauthorized parties. You are responsible for all activity that occurs under your account.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Acceptable Use</h2>
              <p className="text-muted-foreground">You agree not to upload or submit:</p>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li>Malicious, fraudulent, or deceptive files</li>
                <li>Content that violates applicable Philippine or international law</li>
                <li>Files belonging to others without authorization</li>
              </ul>
              <p className="text-muted-foreground">
                We reserve the right to suspend or terminate accounts that misuse the platform, at our discretion
                and without prior notice where necessary.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Subscriptions &amp; Payments</h2>
              <p className="text-muted-foreground">
                Access to advanced features requires a paid plan (Day Pass, Pro Monthly, or Pro Annual) or a valid
                gift code. Billing is processed by our certified payment processors. Subscription access is tied to your
                account and is non-transferable. Gift codes are single-use and grant 24-hour access. Day Pass access
                expires after 24 hours from activation. Pro subscriptions renew automatically unless cancelled before
                the billing period ends.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Refunds</h2>
              <p className="text-muted-foreground">
                Refund requests are handled on a case-by-case basis. Contact{" "}
                <a href="mailto:support@avintph.com" className="text-primary underline-offset-2 hover:underline">
                  support@avintph.com
                </a>{" "}
                within 48 hours of purchase if you experience a technical issue preventing access. We do not offer
                refunds for used access periods or expired gift codes.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Intellectual Property</h2>
              <p className="text-muted-foreground">
                All platform code, design, and branding are owned by AVINTPH INFORMATION TECHNOLOGY SOLUTIONS.
                You retain ownership of documents you upload. By uploading, you grant us the right to process your
                files solely to provide the service.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Data Retention and Deletion</h2>
              <p className="text-muted-foreground">
                AVIntelligence retains uploaded files and related structured workspace records while they are needed to
                provide storage, processing, reports, dashboards, security, and account functionality. You may delete
                files from your workspace and may request full account deletion.
              </p>
              <p className="text-muted-foreground">
                Deletion removes active application data from our primary systems, but limited historical records may
                remain temporarily in backups or logs. Deleted database records may remain in provider-managed backups
                for up to 7 days. Deleted data or related metadata may remain in provider-managed logs for the duration
                of Supabase&apos;s applicable retention periods.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Infrastructure &amp; Security</h2>
              <p className="text-muted-foreground">AVIntelligence is built on enterprise-grade infrastructure:</p>
              <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Database &amp; Storage</strong> (SOC 2 Type II) — row-level security enforced at the database layer</li>
                <li><strong className="text-foreground">Hosting</strong> (SOC 2 Type II · ISO 27001) — TLS encryption and DDoS-protected edge network</li>
                <li><strong className="text-foreground">OpenAI, Anthropic, Google</strong> — enterprise AI processing, no human document review</li>
                <li><strong className="text-foreground">Payments</strong> (PCI-DSS compliant) — no card data stored on our systems</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Service Availability</h2>
              <p className="text-muted-foreground">
                We aim for reliable uptime but do not guarantee uninterrupted service. Maintenance, infrastructure
                issues, or third-party provider downtime may affect availability. Features may be updated or changed
                over time as the product evolves.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Limitation of Liability</h2>
              <p className="text-muted-foreground">
                AVIntelligence is provided on an as-is basis. To the maximum extent permitted by applicable law,
                AVINTPH INFORMATION TECHNOLOGY SOLUTIONS is not liable for any indirect, incidental, or consequential
                damages arising from use of the platform or reliance on generated outputs.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Governing Law</h2>
              <p className="text-muted-foreground">
                These terms are governed by the laws of the Republic of the Philippines.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Updates to Terms</h2>
              <p className="text-muted-foreground">
                We may update these terms as the service evolves. Continued use of the platform after updates
                constitutes acceptance of the revised terms. Material changes will be communicated via email
                where possible.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-semibold text-foreground">Contact</h2>
              <p className="text-muted-foreground">
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
