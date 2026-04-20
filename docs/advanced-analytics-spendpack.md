# Advanced Analytics Spend Support Kit

## Purpose

This kit extends the existing 44-file, 4-month USD Advanced Analytics corpus with a spending-only companion pack.

It exists to push Advanced Analytics toward stronger consumer-facing outputs such as:
- merchant-domain analysis
- vendor concentration
- discount behavior
- geography-aware spending
- category drift over time
- anomaly detection
- payment-method shifts
- recurring vs discretionary spend

This pack is not meant to add more income statements.
It is meant to add richer spending patterns that force more interesting analytics.

## Target Location

Primary output folder:
- `/Users/avin/Documents/AVINTELLIGENCE/Test Files/Stresstest/advancedanalytics_4mo_usd_spendpack`

This should remain separate from the original 44-file set so test intent stays clear.

## Target Volume

Recommended first pack:
- 48 files total
- 12 files per month
- 4 months
- all spending only

This is enough density to create meaningful patterns without making manual review too noisy.

## Dataset Design Principles

The pack should not be random.
It should intentionally encode repeated behavior, spikes, and consumer-relevant merchant stories.

Core principles:
- repeat the same vendors across months so concentration can emerge
- include discounts often enough to support discount analytics
- include location details at neighborhood / district / city level
- include a small amount of regional or international spend later where useful
- vary payment methods
- vary ticket sizes
- mix recurring essentials with more discretionary purchases

## Merchant Domains

Approved domains for this pack:
- Food / Restaurants
- Grocery / Household
- Fashion / Apparel
- Gadgets / Equipment
- Travel / Lodging
- Software / SaaS
- Utilities / Telecom
- Transport / Fuel / Rideshare
- Office / Supplies
- Health / Pharmacy

These should support both direct domain analytics and vendor-level rollups within a domain.

## Geography Model

The geography model should be behavior-oriented, not state-choropleth-oriented.

Preferred layers:
1. local neighborhood / district
2. crosstown / intra-city
3. inter-city domestic travel
4. occasional regional or international spend

Examples of good geography signal:
- Midtown Manhattan vs SoHo vs Williamsburg
- BGC vs Makati vs Ortigas
- NYC vs Austin vs SF during travel months
- occasional international transactions that demonstrate dashboard-level mixed-currency value

Examples of bad geography signal:
- abstract US state spread with no consumer relevance
- route or movement reconstruction
- rideshare path behavior

## Map Guardrail

Any future map chart built on this kit must represent spending geography only.

Allowed:
- spending by area
- average ticket size by area
- domain-specific spend by area
- spend spikes by area
- travel-related spend clusters

Not allowed:
- user movement paths
- rideshare route behavior
- commute behavior
- location tracking

## Currency Intent

This spend pack may later include some non-USD spend, but the purpose would be dashboard intelligence rather than tax reporting.

Rules:
- tax-report logic remains strict and should not cross-aggregate mixed currencies
- dashboard and map analytics may preserve native currency in raw views
- later comparative analytics may normalize to a dominant display currency when clearly disclosed

The dominant display currency will likely be:
- the dominant income currency
- or the dominant workspace currency

## Repeat Vendors

The first version of the pack should favor repeated vendors so the system has enough signal for concentration and discount analysis.

Suggested recurring vendors:
- Restaurants: Sweetgreen, Chipotle, Starbucks, Shake Shack
- Grocery: Whole Foods, Trader Joe's
- Fashion: Nike, Uniqlo, Zara
- Gadgets: Apple Store, Best Buy, B&H Photo
- Travel: Delta, Marriott, Uber
- SaaS: Figma, Notion, Google Workspace
- Utilities / Telecom: Verizon, AT&T
- Office: Staples
- Health: CVS

## Discount Design

At least 4 receipts per month should contain explicit:
- subtotal
- discount amount
- tax
- final total

This is required to support:
- biggest discount by vendor
- discount rate by vendor
- discount-heavy vs full-price merchant behavior
- discount-to-spend comparisons

## Payment Method Design

Vary across:
- Visa
- Mastercard
- Amex
- Debit
- Apple Pay
- Cash

This should help surface:
- payment method share
- payment-method shifts over time
- domain-specific payment-method behavior

## Monthly Story Design

The pack should create four different monthly narratives:

### Month 1: Baseline Recurring Spend
- recurring meals
- grocery staples
- utilities / telecom
- SaaS subscriptions
- modest apparel

Purpose:
- establish recurring baseline
- create first vendor concentration signal

### Month 2: Travel and Dining Lift
- restaurant volume rises
- hotel / flight / rideshare spend appears
- local geography temporarily shifts to travel destinations

Purpose:
- support geography-aware spending and anomaly comparisons

### Month 3: Fashion and Dining Spike
- apparel spike
- dining remains elevated
- more discretionary spend appears

Purpose:
- support recurring vs discretionary analysis
- support category drift over time

### Month 4: Gadget / Equipment Spike
- large one-off electronics spend
- accessory follow-ups
- discount-heavy retail receipts

Purpose:
- support anomaly detection
- support discount narratives
- support high-ticket vendor concentration

## Required Fields Per File

Each file should include:
- vendor name
- merchant address or at least neighborhood / city / state
- document date in readable US format and ideally ISO format too
- receipt or invoice number
- 2 to 5 line items
- subtotal
- discount if applicable
- tax
- total
- payment method
- currency

## Evaluation Targets

The spend pack should make it plausible for Advanced Analytics to nominate outputs such as:
- monthly domain composition
- vendor concentration
- biggest discount vendors
- discount vs spend comparisons
- geography-aware spend summaries
- recurring vs discretionary spending lenses
- outlier months and high-ticket anomalies
- domain drift over time

## Future JSON / Correlation Layer

After the spend pack is uploaded and normalized, a later evaluation layer may export structured aggregates to a downstream analysis layer for second-pass correlation suggestions.

This should remain disciplined.

Good questions:
- which vendors combine high spend with high discounts
- which domains are recurring essentials vs episodic discretionary
- which areas show the highest average spend
- which domains drifted fastest month over month

Bad questions:
- speculative behavioral psychology not grounded in the data
- movement tracking
- unsupported lifestyle claims

The JSON analysis layer should be used to suggest plausible correlations, not to invent them.
