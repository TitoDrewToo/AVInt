# AVIntelligence

AVIntelligence is an AI-powered financial document workspace. It turns receipts, invoices, payslips, contracts, screenshots, and related records into organized data, structured reports, and dashboard-ready insight.

The product is organized around two core experiences:

- **Smart Storage** — upload, organize, and work with financial documents in one workspace
- **Smart Dashboard** — an AI-contextualized financial view built on the user's own records, designed to help people understand what their numbers mean rather than just seeing totals

## Product Capabilities

- Upload and organize receipts, invoices, payslips, contracts, screenshots, and related financial records across PDFs, common image formats, CSV, and XLSX
- Account-isolated storage and extracted records
- Structured data extraction from uploaded documents
- Report generation:
  - Expense Summary
  - Income Summary
  - Profit & Loss
  - Business Expense Report
  - Contract Summary
  - Key Terms Summary
  - Tax Bundle — includes a Schedule C-oriented self-employed report and an employee income worksheet for wage and payslip records. The employee worksheet supports W-2-style review context but is not a substitute for official W-2 or 1099 forms, tax filing software, or tax advice.
- Smart Dashboard with financial KPI widgets, custom dashboard layouts, analytics visuals, and drill-down views
- Multi-currency dashboard handling — money-based totals stay per-currency, with explicit FX conversion where applied
- Advanced analytics surfaces for deeper spend, income, and document-level insight
- Account authentication, subscription access, gift-code redemption, and payment flows
- Account controls for deleting individual files or removing account data

## Privacy and Security Posture

AVIntelligence is built with a privacy-first product posture:

- Files and extracted records are isolated per account, with row-level data isolation
- Document processing runs server-side; sensitive credentials are not exposed to the browser
- Uploads and sensitive actions pass through a dedicated defensive screening layer before deeper processing
- Payment processing is handled by a certified third-party processor; AVIntelligence does not store card data
- AI processing is automated through third-party providers; documents are not subject to manual review by default
- Users can delete individual files or delete their account from the workspace

For full public policy language, see the Privacy Policy and Terms of Service in the application.

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

This project reads configuration from a local `.env.local` file. The app requires credentials for the database layer, authentication, AI processing, and the payment provider. Populate those values in your own local environment and never commit credentials to source control.

## Notes

This README is intentionally product-facing. Internal architecture, operational design, and engineering details live in private engineering documentation rather than this repository.
