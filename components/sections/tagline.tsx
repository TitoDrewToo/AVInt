import { FadeUp } from "@/components/fade-up"

export function TaglineSection() {
  return (
    <section className="border-t border-border px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            We develop products that simplify organization, decisions, and workflows.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Applied intelligence for real-world systems.
          </p>
        </FadeUp>
      </div>
    </section>
  )
}
