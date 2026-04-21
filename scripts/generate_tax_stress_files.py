#!/usr/bin/env python3
"""Generate synthetic Tax Bundle stress-test PDFs.

The output is a reproducible 27-file kit under:
  /Users/avin/Documents/AVINTELLIGENCE/Test Files/Stresstest/taxstresstest

Files are rendered as one-page plain-text PDFs using macOS cupsfilter so they
remain simple, OCR-friendly, and easy to inspect.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path("/Users/avin/Documents/AVINTELLIGENCE/Test Files/Stresstest/taxstresstest")


@dataclass(frozen=True)
class DocSpec:
    folder: str
    filename: str
    body: str


def money(value: str) -> str:
    return value


def receipt(
    vendor: str,
    address: str,
    phone: str,
    website: str,
    receipt_no: str,
    date_display: str,
    date_iso: str,
    time_display: str,
    cashier: str,
    primary_desc: str,
    subtotal: str,
    tax: str,
    total: str,
    filler1: str = "Service Fee",
    filler1_amt: str = "$0.00",
    filler2: str = "Adjustment",
    filler2_amt: str = "$0.00",
    footer: str = "Approved - Thank you for shopping with us!",
) -> str:
    return f"""{vendor}
{address}
{phone} · {website}
----------------------------------------------------------------
                            RECEIPT

Receipt #: {receipt_no}
Date: {date_display}    Time: {time_display}
Date (ISO): {date_iso}
Cashier: {cashier}

Description                         Qty    Amount
--------------------------------------------------
{primary_desc:<34} 1    {total}
{filler1:<34} 1    {filler1_amt}
{filler2:<34} 1    {filler2_amt}

                           Subtotal: {subtotal}
                    Sales Tax (8.875%): {tax}
                           --------------------
                              TOTAL: {total}

Payment: Visa ending 4412
Currency: USD
{footer}
"""


def invoice(
    vendor: str,
    address: str,
    contact: str,
    invoice_no: str,
    date_display: str,
    date_iso: str,
    due_display: str,
    bill_to: str,
    bill_address: str,
    primary_desc: str,
    total: str,
    qty: str = "1",
    second_desc: str = "Administrative line item",
    second_amt: str = "$0.00",
) -> str:
    return f"""{vendor}                                   INVOICE
{address}
{contact}                           Invoice #: {invoice_no}
Date: {date_display} / {date_iso}
Due Date: {due_display}

Bill To:
{bill_to}
{bill_address}

----------------------------------------------------------------
Description                               Hours/Qty     Amount
----------------------------------------------------------------
{primary_desc:<40} {qty:>6}    {total}
{second_desc:<40} {"1":>6}    {second_amt}
----------------------------------------------------------------
                                         Subtotal: {total}
                                              Tax: $0.00
                                         ----------------
                                        TOTAL DUE: {total}

Payment Terms: Net 30
Currency: USD
Thank you for your business.
"""


def payslip(
    pay_period_start: str,
    pay_period_end: str,
    pay_date: str,
    gross: str,
    net: str,
    federal: str,
    social: str,
    medicare: str,
    k401: str,
    health: str,
    ytd_gross: str,
    ytd_net: str,
) -> str:
    total_deductions = _money_subtract(gross, net)
    return f"""ACME CORP
100 Market Street, San Francisco, CA 94105
----------------------------------------------------------------
                         PAY STATEMENT

Employee: Andrew V.                   Employee ID: E-00123
Pay Period: {pay_period_start} to {pay_period_end}
Pay Date:   {pay_date}
Department: Engineering

EARNINGS                   Current         YTD
------------------------------------------------
Regular Pay              {gross:>9}   {ytd_gross:>10}
Overtime                 $    0.00   $     0.00
                        -----------   ----------
Gross Pay:              {gross:>9}   {ytd_gross:>10}

DEDUCTIONS                 Current         YTD
------------------------------------------------
Federal Withholding      {federal:>9}   $  2,980.00
Social Security (6.2%)   {social:>9}   $    632.40
Medicare (1.45%)         {medicare:>9}   $    147.90
401(k) Contribution      {k401:>9}   $    800.00
Health Insurance         {health:>9}   $    760.00
                        -----------   ----------
Total Deductions:        {total_deductions:>9}   $  5,320.30

Net Pay:                 {net:>9}   {ytd_net:>10}

Currency: USD
Payment Method: Direct Deposit ending 8821
"""


def income_statement(
    period_start: str,
    period_end: str,
    gross_revenue: str,
    consulting: str,
    retainers: str,
    prepared_date: str,
) -> str:
    return f"""AVIN FREELANCE SERVICES
501 Congress Ave, Austin, TX 78701
EIN: 12-3456789

                        INCOME STATEMENT
           For the period {period_start} to {period_end}

REVENUE
----------------------------------------
  Consulting Fees            {consulting}
  Project Retainers          {retainers}
  Other Revenue              $     0.00
  --------------------------------------
  Gross Revenue:             {gross_revenue}

OPERATING EXPENSES (reported separately on receipts)
----------------------------------------
  See accompanying expense schedule.

Reporting Period: {period_start} to {period_end}
Prepared: {prepared_date}
Currency: USD
Reference No: REV-{period_start.replace('-', '')}-{period_end.replace('-', '')}
"""


def form_1099_div() -> str:
    return """                           Form 1099-DIV
                     Dividends and Distributions
                             Tax Year 2025

PAYER:                              RECIPIENT:
Charles Schwab & Co., Inc.          Andrew V.
211 Main Street                     410 West 12th St
San Francisco, CA 94105             Austin, TX 78701
Federal ID: 94-1737782              Recipient TIN: XXX-XX-4321

Account Number: XXXX-8841
Date: January 31, 2026
Tax Year: 2025

------------------------------------------------
Box 1a - Total Ordinary Dividends      $1,250.00
Box 1b - Qualified Dividends           $1,100.00
Box 2a - Total Capital Gain Distr.     $   0.00
Box 3  - Nondividend Distributions     $   0.00
Box 4  - Federal Income Tax Withheld   $   0.00
------------------------------------------------

This is important tax information and is being furnished
to the Internal Revenue Service.
"""


def rental_summary() -> str:
    return """RENTAL PROPERTY INCOME SUMMARY
Property: 123 Main St, Unit 4B, Austin TX 78701
Owner:    Andrew V.

Reporting Period: January 1, 2025 - December 31, 2025
Prepared: 2026-01-05

MONTHLY RENT RECEIVED
----------------------------
January   2025      $1,000.00
February  2025      $1,000.00
March     2025      $1,000.00
April     2025      $1,000.00
May       2025      $1,000.00
June      2025      $1,000.00
July      2025      $1,000.00
August    2025      $1,000.00
September 2025      $1,000.00
October   2025      $1,000.00
November  2025      $1,000.00
December  2025      $1,000.00
----------------------------
Gross Rental Income: $12,000.00
Currency: USD
"""


def bank_statement() -> str:
    return """CHASE BUSINESS BANKING
Account ending 7823
Statement Period: December 1, 2025 - December 31, 2025

ACCOUNT SUMMARY
------------------------------------
Beginning Balance       $8,245.00
Deposits & Credits      $4,910.00
Withdrawals & Debits    $3,180.00
Fees                    $   45.00
Ending Balance          $9,930.00

FEE DETAIL
------------------------------------
12/20/2025  Monthly Account Maintenance Fee    $45.00
------------------------------------
Total Fees This Period:                         $45.00
Currency: USD
"""


def _money_subtract(left: str, right: str) -> str:
    def parse(value: str) -> int:
        return int(round(float(value.replace("$", "").replace(",", "")) * 100))

    cents = parse(left) - parse(right)
    sign = "-" if cents < 0 else ""
    cents = abs(cents)
    dollars, remainder = divmod(cents, 100)
    return f"{sign}${dollars:,}.{remainder:02d}"


def specs() -> list[DocSpec]:
    return [
        DocSpec("2025 Tax Docs", "2025-Q1-income-statement.pdf", income_statement("2025-01-01", "2025-03-31", "$18,000.00", "$14,500.00", "$3,500.00", "2025-04-02")),
        DocSpec("2025 Tax Docs", "2025-Q2-income-statement.pdf", income_statement("2025-04-01", "2025-06-30", "$22,000.00", "$17,250.00", "$4,750.00", "2025-07-02")),
        DocSpec("2025 Tax Docs", "2025-Q3-income-statement.pdf", income_statement("2025-07-01", "2025-09-30", "$15,000.00", "$11,800.00", "$3,200.00", "2025-10-02")),
        DocSpec("2025 Tax Docs", "2025-Q4-income-statement.pdf", income_statement("2025-10-01", "2025-12-31", "$25,000.00", "$19,400.00", "$5,600.00", "2026-01-03")),
        DocSpec("2025 Tax Docs", "2025-03-payslip-acme.pdf", payslip("2025-03-01", "2025-03-31", "2025-04-01", "$5,000.00", "$3,800.00", "$420.00", "$310.00", "$72.50", "$220.00", "$177.50", "$15,000.00", "$11,400.00")),
        DocSpec("2025 Tax Docs", "2025-06-payslip-acme.pdf", payslip("2025-06-01", "2025-06-30", "2025-07-01", "$5,200.00", "$3,950.00", "$445.00", "$322.40", "$75.40", "$230.00", "$177.20", "$30,600.00", "$23,650.00")),
        DocSpec("2025 Tax Docs", "receipt-meta-ads-jan.pdf", receipt("Meta Platforms Inc.", "1 Hacker Way, Menlo Park, CA 94025", "(650) 543-4800", "business.facebook.com", "540812", "January 15, 2025", "2025-01-15", "09:42", "Elena", "Facebook Ads - January Campaign", "$450.00", "$0.00", "$450.00")),
        DocSpec("2025 Tax Docs", "receipt-shell-fuel-feb.pdf", receipt("Shell", "2880 Market St, San Francisco, CA 94114", "(415) 555-1008", "shell.us", "663194", "February 08, 2025", "2025-02-08", "08:16", "Marco", "Unleaded Fuel 22.4 gal", "$85.00", "$0.00", "$85.00")),
        DocSpec("2025 Tax Docs", "invoice-consulting-mar.pdf", invoice("Jane Smith Consulting LLC", "220 West 37th St, New York, NY 10018", "(212) 555-4200 · hello@janesmithconsulting.com", "INV-2025-004", "March 20, 2025", "2025-03-20", "April 19, 2025", "Avin Freelance Services", "501 Congress Ave, Austin, TX 78701", "Brand strategy consulting - 20 hours", "$2,000.00", qty="20")),
        DocSpec("2025 Tax Docs", "receipt-apple-macbook-apr.pdf", receipt("Apple Store", "300 Post St, San Francisco, CA 94108", "(415) 392-0200", "apple.com", "771245", "April 10, 2025", "2025-04-10", "14:08", "Tina", "MacBook Pro 14-inch M3", "$2,499.00", "$0.00", "$2,499.00")),
        DocSpec("2025 Tax Docs", "invoice-hiscox-insurance-may.pdf", invoice("Hiscox Business Insurance", "520 Madison Ave, New York, NY 10022", "(866) 283-7545 · service@hiscox.com", "INV-2025-051", "May 01, 2025", "2025-05-01", "May 31, 2025", "Avin Freelance Services", "501 Congress Ave, Austin, TX 78701", "General Liability - Annual Premium", "$1,200.00")),
        DocSpec("2025 Tax Docs", "invoice-wilson-law-jun.pdf", invoice("Wilson Law Office", "410 Battery St, Seattle, WA 98121", "(206) 555-8012 · intake@wilsonlaw.example", "INV-2025-188", "June 15, 2025", "2025-06-15", "July 15, 2025", "Avin Freelance Services", "501 Congress Ave, Austin, TX 78701", "Legal services - contract review", "$850.00")),
        DocSpec("2025 Tax Docs", "receipt-staples-office-jul.pdf", receipt("Staples", "560 Howard St, San Francisco, CA 94105", "(415) 555-3301", "staples.com", "448211", "July 05, 2025", "2025-07-05", "11:13", "Chris", "Office supplies - printer paper, pens, folders", "$125.00", "$0.00", "$125.00")),
        DocSpec("2025 Tax Docs", "invoice-wework-coworking-aug.pdf", invoice("WeWork", "600 California St, San Francisco, CA 94108", "(646) 389-3922 · billing@wework.com", "INV-2025-801", "August 01, 2025", "2025-08-01", "August 31, 2025", "Avin Freelance Services", "501 Congress Ave, Austin, TX 78701", "Coworking Membership - August 2025", "$600.00")),
        DocSpec("2025 Tax Docs", "receipt-figma-saas-sep.pdf", receipt("Figma", "760 Market St, San Francisco, CA 94102", "(415) 555-9090", "figma.com", "992014", "September 01, 2025", "2025-09-01", "07:54", "Liam", "Figma Professional Subscription - September", "$45.00", "$0.00", "$45.00")),
        DocSpec("2025 Tax Docs", "receipt-figma-saas-sep-DUP.pdf", receipt("Figma", "760 Market St, San Francisco, CA 94102", "(415) 555-9090", "figma.com", "992014", "September 01, 2025", "2025-09-01", "07:54", "Liam", "Figma Professional Subscription - September", "$45.00", "$0.00", "$45.00")),
        DocSpec("2025 Tax Docs", "receipt-delta-airfare-oct.pdf", receipt("Delta Air Lines", "1030 Delta Blvd, Atlanta, GA 30354", "(800) 221-1212", "delta.com", "330901", "October 12, 2025", "2025-10-12", "13:17", "Nora", "Round trip NYC -> SFO, business travel", "$650.00", "$0.00", "$650.00")),
        DocSpec("2025 Tax Docs", "receipt-keens-meals-nov.pdf", receipt("Keens Steakhouse", "72 W 36th St, New York, NY 10018", "(212) 947-3636", "keens.com", "281641", "November 18, 2025", "2025-11-18", "20:11", "Diego", "Business Meal - client dinner", "$220.00", "$0.00", "$220.00")),
        DocSpec("2025 Tax Docs", "receipt-carmines-meals-nov.pdf", receipt("Carmines", "200 W 44th St, New York, NY 10036", "(212) 221-3800", "carminesnyc.com", "516772", "November 22, 2025", "2025-11-22", "13:36", "Rosa", "Business Meal - team lunch", "$180.00", "$0.00", "$180.00")),
        DocSpec("2025 Tax Docs", "invoice-verizon-internet-dec.pdf", invoice("Verizon Business", "1300 I St NW, Washington, DC 20005", "(800) 465-4054 · support@verizonbusiness.com", "INV-2025-1201", "December 01, 2025", "2025-12-01", "December 31, 2025", "Avin Freelance Services", "501 Congress Ave, Austin, TX 78701", "Business Internet - December", "$120.00")),
        DocSpec("2025 Tax Docs", "receipt-coursera-training-dec.pdf", receipt("Coursera", "381 E Evelyn Ave, Mountain View, CA 94041", "(800) 555-2121", "coursera.org", "874120", "December 15, 2025", "2025-12-15", "10:07", "Maya", "Professional Certificate - Data Engineering", "$300.00", "$0.00", "$300.00")),
        DocSpec("2025 Tax Docs", "statement-chase-bank-fees-dec.pdf", bank_statement()),
        DocSpec("2025 Tax Docs", "receipt-walmart-misc-jul.pdf", receipt("Walmart", "8400 N MoPac Expy, Austin, TX 78759", "(512) 555-7788", "walmart.com", "200731", "July 20, 2025", "2025-07-20", "16:25", "Sofia", "Household miscellaneous", "$65.00", "$0.00", "$65.00")),
        DocSpec("Investments", "2025-1099-div-schwab.pdf", form_1099_div()),
        DocSpec("Investments", "2025-rental-income-summary.pdf", rental_summary()),
        DocSpec("2024 Archive", "2024-Q4-income-statement.pdf", income_statement("2024-10-01", "2024-12-31", "$10,000.00", "$7,800.00", "$2,200.00", "2025-01-03")),
        DocSpec("2024 Archive", "receipt-staples-office-2024-nov.pdf", receipt("Staples", "560 Howard St, San Francisco, CA 94105", "(415) 555-3301", "staples.com", "771105", "November 10, 2024", "2024-11-10", "15:44", "Aaron", "Office supplies", "$75.00", "$0.00", "$75.00")),
    ]


def render_pdf(text: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(text.strip() + "\n")
        temp_path = Path(handle.name)

    try:
        result = subprocess.run(
            ["cupsfilter", "-m", "application/pdf", str(temp_path)],
            check=True,
            capture_output=True,
        )
        destination.write_bytes(result.stdout)
    finally:
        temp_path.unlink(missing_ok=True)


def write_manifest(documents: list[DocSpec]) -> None:
    lines = [
        "Tax Bundle stress-test kit",
        "",
        f"Base path: {BASE_DIR}",
        f"Total PDFs: {len(documents)}",
        "",
    ]
    current_folder = None
    for doc in documents:
        if doc.folder != current_folder:
            current_folder = doc.folder
            lines.append(f"[{current_folder}]")
        lines.append(f"- {doc.filename}")
    (BASE_DIR / "MANIFEST.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    documents = specs()
    BASE_DIR.mkdir(parents=True, exist_ok=True)
    for doc in documents:
        render_pdf(doc.body, BASE_DIR / doc.folder / doc.filename)
    write_manifest(documents)
    print(f"Generated {len(documents)} PDFs under {BASE_DIR}")


if __name__ == "__main__":
    main()
