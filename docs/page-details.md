# AVIntelligence Page Overview

This document summarizes the main user-facing pages in AVIntelligence at a product level.

## Core Pages

### Home

Purpose:
- introduce AVIntelligence
- explain the document-to-data workflow
- guide visitors toward Smart Storage, Smart Dashboard, and pricing

### Smart Storage

Purpose:
- help users bring documents into one workspace
- organize uploaded materials
- support moving from files to report-ready records

### Smart Dashboard

Purpose:
- present an AI-contextualized view of the user's financial activity, not a generic charts page
- use financial visuals as the interface and AI-derived context as the differentiator
- help users understand what their numbers mean, why patterns matter, and what may be worth acting on
- connect the workspace into the Advanced Analytics pipeline so deeper spend, income, document, tax, forecasting, and anomaly views feel like a natural extension of the dashboard

### Pricing

Purpose:
- explain available access options
- guide users into the purchase flow
- support signup-first access into checkout for paid plans

### Blog

Purpose:
- publish educational content related to document workflows, reporting, and financial organization

### Privacy and Terms

Purpose:
- provide policy and legal information for public users
- explain retention, deletion, billing, and service-use boundaries at a public-facing level

## Account and Onboarding

### Sign Up and Sign In

Purpose:
- create or access an account
- continue into product experiences that require authentication
- support purchase flows that require an authenticated account

### Welcome Flow

Purpose:
- orient new users immediately after signup
- point them toward Smart Storage and Smart Dashboard

## In-Product Areas

### Smart Storage Workspace

Main objectives:
- upload documents
- review files
- organize information
- generate reports

### Smart Dashboard Workspace

Main objectives:
- give users an intelligent financial workspace grounded in their own documents, transactions, receipts, income records, and tax inputs
- keep financial visuals as the interface while leaning on AI-derived context for interpretation and guidance
- surface what numbers mean, why patterns matter, and what risks or opportunities are emerging
- support decision-making without overstating regulated financial or tax advice
- serve as the natural entry point into Advanced Analytics for deeper spend analysis, income patterns, document intelligence, tax readiness, business reporting, forecasting, anomaly detection, and AI-generated summaries
- treat currency as a first-class dimension for money visuals; do not mix currencies into one total or one y-axis without explicit FX conversion

See also:
- `smart-dashboard-multi-currency.md` for the approved multi-currency dashboard model, including per-currency KPI cards and currency-aware trend/category visuals.

Related report surfaces:
- Tax Bundle (self-employed, US Schedule C) is the reinforced primary tax report surface today.
- Tax Bundle (employed, US W-2) is a planned counterpart designed for salaried US filers. A shell may be in place, but the full report logic is still pending construction and should not be treated as a shipped surface yet.

### Account Panel

Purpose:
- give signed-in users access to account controls
- show current subscription state and gift-code redemption
- link out to the canonical Privacy and Terms pages

## Documentation Direction

Public-facing docs for this repository should focus on:

- product capabilities
- user outcomes
- use cases
- setup instructions at a high level

They should avoid detailing internal architecture, implementation design, or operational internals unless there is a clear reason to publish them.

Current note:
- the product assistant scaffold exists in the repo but is intentionally hidden until a future wiki-backed knowledge source is ready
