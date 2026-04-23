# Smart Dashboard Multi-Currency Model

## Purpose

Smart Dashboard treats currency as a first-class dimension.

The product does not force all financial activity into a single global currency, and it does not combine unlike currencies into one money total. If a user has income in one currency and spending in another, those are represented as separate financial realities unless explicit FX conversion is applied.

The goal is correct separation, clear visual grouping, and richer context — not silent currency conversion.

## Core Principle

Do not mix currencies in monetary totals.

Count-based views may remain global. Money-based views stay currency-aware.

Examples:
- document counts can span all currencies
- income totals are reported per currency
- expense totals are reported per currency
- net position is reported per currency
- income vs. expense trends are reported per currency

## Why This Matters

Users may naturally operate across multiple currencies — for example, local wages in one currency and online services in another, or freelance revenue in one currency while daily expenses sit in another. This is not an edge case; it is a meaningful signal.

Multi-currency context can reveal useful patterns such as:
- income concentrated in one currency while software, travel, or subscription spend sits in another
- stable local daily spend alongside growing foreign-currency subscriptions
- one currency dominated by wage income while another is dominated by business revenue
- foreign-currency spending clustering around travel, software, imports, or cross-border services

## What the Dashboard Shows

- per-currency KPI cards for income, expense, and net position
- currency-aware trend and category visuals
- explicit FX conversion where the user has enabled a unified display currency
- clear labeling when values have been converted versus reported in their native currency
