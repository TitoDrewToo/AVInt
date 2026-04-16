# AVIntelligence

AVIntelligence helps turn everyday financial documents into organized data, reports, and visual insights.

The product is built around two core experiences:

- `Smart Storage`
  - bring receipts, invoices, screenshots, contracts, and related files into one workspace
  - organize uploaded material and prepare it for reporting
  - move from raw files to usable records faster
- `Smart Dashboard`
  - view metrics, charts, and summaries from structured document data
  - track trends and monitor financial activity in one place
  - work from a clearer visual view of your records

## What AVIntelligence Is For

AVIntelligence is designed for people who want to:

- centralize financial documents
- reduce manual sorting and repetitive data entry
- move from uploads to reports more quickly
- review data through dashboards and summaries

## Main Product Areas

- Marketing site
  - homepage
  - product pages
  - pricing
  - blog
  - privacy and terms
- Product workspace
  - Smart Storage
  - Smart Dashboard
- Account and onboarding
  - sign up
  - welcome flow
  - access and purchase entry points

## Local Development

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Create a production build:

```bash
pnpm build
pnpm start
```

Run linting:

```bash
pnpm lint
```

## Environment

Create a local `.env.local` for the services used by this project.

Examples of values you may need:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=

SUPABASE_SERVICE_ROLE_KEY=

CREEM_API_KEY=
CREEM_WEBHOOK_SECRET=
```

Keep secrets out of source control and only expose values intended for client-side use.

## Notes

- This README is intentionally product-facing.
- Public documentation should describe capabilities, use cases, and objectives rather than internal architecture.
- Repository-aware tools such as Code Wiki can infer code structure directly from the codebase when deeper understanding is needed.
