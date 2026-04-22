# AVIntelligence

AVIntelligence helps turn everyday financial documents into organized data, reports, and visual insights.

The product is built around two core experiences:

- `Smart Storage`
  - bring receipts, invoices, screenshots, contracts, and related files into one workspace
  - organize uploaded material and prepare it for reporting
  - move from raw files to usable records faster
- `Smart Dashboard`
  - an intelligent financial workspace rather than a generic charts page
  - financial visuals are the interface; AI-derived context is the differentiator
  - turn documents, receipts, income records, tax inputs, and business activity into contextual insight
  - help users understand what their numbers mean, why patterns matter, and what risks or opportunities are emerging
  - connect naturally to the Advanced Analytics pipeline for deeper spend analysis, income patterns, document intelligence, tax readiness, forecasting, anomaly detection, and AI-generated summaries

## What AVIntelligence Is For

AVIntelligence is designed for people who want to:

- centralize financial documents
- reduce manual sorting and repetitive data entry
- move from uploads to reports more quickly
- review data through dashboards and summaries
- understand the context behind their numbers, not just the totals
- surface patterns, anomalies, and decision-relevant signals from their own records

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

## Security and Privacy Posture

AVIntelligence handles financial documents with a privacy-first product posture:

- user files and extracted records are isolated by account
- uploads are screened before document processing begins
- document processing runs server-side; sensitive service keys are not exposed to the browser
- AI processing is automated through third-party providers; documents are not manually reviewed
- payments are handled by Creem, and card or banking details are not stored by AVIntelligence
- users can delete individual files or delete their account from the workspace

For the full public policy language, see the Privacy Policy and Terms of Service in the application.

## Current Repository Notes

- The product assistant/chat guide is scaffolded in the codebase but intentionally hidden for now.
- It is planned to return later as a subscriber feature once a stronger wiki-backed knowledge source is ready.
- Advanced Analytics is at a baseline state and current planning is focused on enriching output quality rather than reviving earlier discarded directions.
- Smart Dashboard direction is shifting from a charts-first surface to an AI-contextualized financial workspace. Financial visuals remain the interface, but interpretation, pattern context, and decision support are the active emphasis.
- Tax Bundle (self-employed, US Schedule C) is the reinforced primary tax report. An employed (US W-2) Tax Bundle variant is on the roadmap; a shell may be present, but the full report logic is still pending construction and is not yet a shipped surface.

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
NEXT_PUBLIC_AA_BETA_EMAIL=

SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=

CREEM_API_KEY=
CREEM_TEST_MODE=
CREEM_WEBHOOK_SECRET=
CREEM_PRODUCT_DAY_PASS_ID=
CREEM_PRODUCT_PRO_MONTHLY_ID=
CREEM_PRODUCT_PRO_ANNUAL_ID=
CREEM_PRODUCT_GIFT_CODE_ID=
```

Keep secrets out of source control and only expose values intended for client-side use.

## Notes

- This README is intentionally product-facing.
- Public documentation should describe capabilities, use cases, and objectives rather than internal architecture.
- Repository-aware tools such as Code Wiki can infer code structure directly from the codebase when deeper understanding is needed.
