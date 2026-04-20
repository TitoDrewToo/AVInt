from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import textwrap


OUT_ROOT = Path("/Users/avin/Documents/AVINTELLIGENCE/Test Files/Stresstest/advancedanalytics_4mo_usd")

PAGE_W = 1654
PAGE_H = 2339
MARGIN = 90


def load_font(size: int, bold: bool = False):
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Tahoma.ttf",
    ]
    for candidate in candidates:
        p = Path(candidate)
        if p.exists():
            return ImageFont.truetype(str(p), size=size)
    return ImageFont.load_default()


FONT_H1 = load_font(42, bold=True)
FONT_H2 = load_font(30, bold=True)
FONT_BODY = load_font(24)
FONT_SMALL = load_font(20)
FONT_MONO = load_font(22)


@dataclass
class DocSpec:
    rel_dir: str
    filename: str
    title: str
    header: List[str]
    meta: List[Tuple[str, str]]
    line_items: List[Tuple[str, str, str]]
    totals: List[Tuple[str, str]]
    footer: List[str]


def money(amount: float) -> str:
    return f"${amount:,.2f}"


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, font, fill="#0f0f0f", width_chars: int = 90, line_gap: int = 8):
    lines = textwrap.wrap(text, width=width_chars) or [text]
    cur_y = y
    for line in lines:
        draw.text((x, cur_y), line, font=font, fill=fill)
        cur_y += font.size + line_gap
    return cur_y


def render_pdf(spec: DocSpec):
    out_dir = OUT_ROOT / spec.rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / spec.filename

    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)

    y = MARGIN
    for idx, line in enumerate(spec.header):
        font = FONT_H2 if idx == 0 else FONT_BODY
        draw.text((MARGIN, y), line, font=font, fill="#111111")
        y += font.size + 6

    y += 18
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#222222", width=2)
    y += 28
    draw.text((MARGIN, y), spec.title, font=FONT_H1, fill="#111111")
    y += FONT_H1.size + 22

    left_x = MARGIN
    right_x = PAGE_W - MARGIN - 420
    meta_y = y
    for idx, (k, v) in enumerate(spec.meta):
        target_x = left_x if idx % 2 == 0 else right_x
        target_y = meta_y + (idx // 2) * 42
        draw.text((target_x, target_y), f"{k}: {v}", font=FONT_BODY, fill="#222222")
    y = meta_y + ((len(spec.meta) + 1) // 2) * 42 + 28

    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#d0d0d0", width=2)
    y += 24
    draw.text((MARGIN, y), "Description / Line Items", font=FONT_H2, fill="#111111")
    y += FONT_H2.size + 14

    draw.text((MARGIN, y), "Description", font=FONT_SMALL, fill="#444444")
    draw.text((PAGE_W - MARGIN - 210, y), "Qty/Hrs", font=FONT_SMALL, fill="#444444")
    draw.text((PAGE_W - MARGIN - 80, y), "Amount", font=FONT_SMALL, fill="#444444")
    y += FONT_SMALL.size + 12
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#e0e0e0", width=1)
    y += 16

    for desc, qty, amt in spec.line_items:
        y = draw_wrapped(draw, desc, MARGIN, y, FONT_BODY, width_chars=62, line_gap=5)
        draw.text((PAGE_W - MARGIN - 210, y - FONT_BODY.size - 5), qty, font=FONT_BODY, fill="#222222")
        draw.text((PAGE_W - MARGIN - 140, y - FONT_BODY.size - 5), amt, font=FONT_BODY, fill="#222222")
        y += 14

    y += 10
    draw.line((PAGE_W - MARGIN - 350, y, PAGE_W - MARGIN, y), fill="#d0d0d0", width=1)
    y += 18
    for label, value in spec.totals:
        draw.text((PAGE_W - MARGIN - 300, y), label, font=FONT_BODY, fill="#222222")
        draw.text((PAGE_W - MARGIN - 10 - len(value) * 14, y), value, font=FONT_BODY, fill="#111111")
        y += FONT_BODY.size + 10

    y += 24
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#d0d0d0", width=2)
    y += 28
    draw.text((MARGIN, y), "Notes", font=FONT_H2, fill="#111111")
    y += FONT_H2.size + 10
    for line in spec.footer:
        y = draw_wrapped(draw, line, MARGIN, y, FONT_SMALL, fill="#4a4a4a", width_chars=92, line_gap=6)
        y += 8

    img.save(out_path, "PDF", resolution=150.0)


def receipt(rel_dir, filename, vendor, date_human, date_iso, total, description, payment, extra_header=None):
    subtotal = round(total, 2)
    return DocSpec(
        rel_dir=rel_dir,
        filename=filename,
        title="RECEIPT",
        header=[
            vendor,
            extra_header or "Business Services Division · 500 Market Street, Austin TX 78701 · (512) 555-0199",
        ],
        meta=[
            ("Receipt #", filename.replace(".pdf", "").upper()),
            ("Date", date_human),
            ("Date ISO", date_iso),
            ("Currency", "USD"),
            ("Payment", payment),
            ("Reference", f"TXN-{date_iso.replace('-', '')}-{filename[:4].upper()}"),
        ],
        line_items=[
            (description, "1", money(subtotal)),
            ("Processing / support line", "1", "$0.00"),
            ("Internal ref / tax marker", "1", "$0.00"),
        ],
        totals=[
            ("Subtotal", money(subtotal)),
            ("Tax", "$0.00"),
            ("TOTAL", money(total)),
        ],
        footer=[
            "Prepared for Avin Freelance Studio.",
            "Payment method and vendor naming are intentionally explicit to support normalization, grouping, and advanced analytics.",
        ],
    )


def invoice(rel_dir, filename, vendor, date_human, date_iso, total, description, hours="1", extra_header=None):
    return DocSpec(
        rel_dir=rel_dir,
        filename=filename,
        title="INVOICE",
        header=[
            vendor,
            extra_header or "Accounts Receivable · 1200 Commerce Ave, New York NY 10018 · billing@example.com",
        ],
        meta=[
            ("Invoice #", filename.replace(".pdf", "").upper()),
            ("Date", date_human),
            ("Date ISO", date_iso),
            ("Due Date", date_iso),
            ("Bill To", "Avin Freelance Studio"),
            ("Currency", "USD"),
        ],
        line_items=[
            (description, hours, money(total)),
            ("Administrative line", "1", "$0.00"),
            ("Reference code", "1", "$0.00"),
        ],
        totals=[
            ("Subtotal", money(total)),
            ("Tax", "$0.00"),
            ("TOTAL DUE", money(total)),
        ],
        footer=[
            "Net 30 terms. Thank you for your business.",
            "This document includes clear vendor, date, and total signals for OCR and normalization.",
        ],
    )


def payslip(rel_dir, filename, employer, period_start, period_end, pay_date, gross, net):
    deductions = round(gross - net, 2)
    return DocSpec(
        rel_dir=rel_dir,
        filename=filename,
        title="PAY STATEMENT",
        header=[
            employer,
            "Payroll Department · 84 Silicon Park, Austin TX 78759 · payroll@orbitix.example",
        ],
        meta=[
            ("Employee", "Andrew V."),
            ("Employee ID", "E-00123"),
            ("Pay Period", f"{period_start} to {period_end}"),
            ("Pay Date", pay_date),
            ("Currency", "USD"),
            ("Department", "Strategy"),
        ],
        line_items=[
            ("Regular Pay", "1", money(gross)),
            ("Federal Withholding", "1", money(round(deductions * 0.38, 2))),
            ("Social Security / Medicare", "1", money(round(deductions * 0.24, 2))),
            ("401(k) + Health Insurance", "1", money(round(deductions * 0.38, 2))),
        ],
        totals=[
            ("Gross Pay", money(gross)),
            ("Total Deductions", money(deductions)),
            ("Net Pay", money(net)),
        ],
        footer=[
            "This payslip is informational for wage analysis and withholding-style summaries.",
            "Gross Pay and Net Pay are the intended machine-readable fields.",
        ],
    )


def income_statement(rel_dir, filename, period_start, period_end, gross, consulting, retainers):
    return DocSpec(
        rel_dir=rel_dir,
        filename=filename,
        title="INCOME STATEMENT",
        header=[
            "AVIN FREELANCE STUDIO",
            "EIN 12-3456789 · 210 Hudson Square, New York NY 10013 · finance@avinfreelance.example",
        ],
        meta=[
            ("Reporting Period", f"{period_start} to {period_end}"),
            ("Prepared", period_end),
            ("Currency", "USD"),
            ("Statement Type", "Business Revenue"),
            ("Jurisdiction", "US-NY"),
            ("Reference", filename.replace(".pdf", "").upper()),
        ],
        line_items=[
            ("Consulting retainers", "1", money(retainers)),
            ("Project delivery revenue", "1", money(consulting)),
            ("Other revenue", "1", "$0.00"),
        ],
        totals=[
            ("Gross Revenue", money(gross)),
            ("Operating Expenses", "Reported separately"),
            ("NET ON THIS SHEET", money(gross)),
        ],
        footer=[
            "This file is intended to normalize as business income, not wage income.",
            "Expense support documents are stored separately to test cross-document analytics.",
        ],
    )


def build_specs() -> List[DocSpec]:
    months = [
        {
            "dir": "2026-01",
            "human": "January",
            "period": ("2026-01-01", "2026-01-31"),
            "income_total": 18500.0,
            "income_consulting": 9500.0,
            "income_retainers": 9000.0,
            "gross": 5200.0,
            "net": 3980.0,
            "docs": [
                ("receipt", "2026-01-receipt-meta-ads.pdf", "Meta Platforms Inc.", 420.0, "Facebook Ads — January acquisition campaign", "Visa ending 4412"),
                ("invoice", "2026-01-invoice-wework.pdf", "WeWork", 600.0, "Coworking membership — January 2026", "1"),
                ("invoice", "2026-01-invoice-verizon.pdf", "Verizon Business", 120.0, "Business internet — January service", "1"),
                ("receipt", "2026-01-receipt-figma.pdf", "Figma", 45.0, "Professional design subscription — January", "Visa ending 4412"),
                ("invoice", "2026-01-invoice-contract-labor.pdf", "Mason Reed Consulting", 900.0, "Design systems support — 9 hours", "9"),
                ("invoice", "2026-01-invoice-wilson-legal.pdf", "Wilson Law Office", 950.0, "Contract review and legal advisory", "1"),
                ("receipt", "2026-01-receipt-client-meal.pdf", "Balthazar", 140.0, "Business dinner with retained client", "Amex ending 1022"),
                ("invoice", "2026-01-invoice-stripe-fees.pdf", "Stripe", 38.0, "Card processing and platform fees", "1"),
                ("invoice", "2026-01-invoice-hiscox-insurance.pdf", "Hiscox Business Insurance", 1200.0, "General liability annual coverage", "1"),
            ],
        },
        {
            "dir": "2026-02",
            "human": "February",
            "period": ("2026-02-01", "2026-02-28"),
            "income_total": 21400.0,
            "income_consulting": 12400.0,
            "income_retainers": 9000.0,
            "gross": 5200.0,
            "net": 3980.0,
            "docs": [
                ("receipt", "2026-02-receipt-meta-ads.pdf", "Meta Platforms Inc.", 690.0, "Facebook Ads — February growth push", "Visa ending 4412"),
                ("invoice", "2026-02-invoice-wework.pdf", "WeWork", 600.0, "Coworking membership — February 2026", "1"),
                ("invoice", "2026-02-invoice-verizon.pdf", "Verizon Business", 120.0, "Business internet — February service", "1"),
                ("receipt", "2026-02-receipt-figma.pdf", "Figma", 45.0, "Professional design subscription — February", "Visa ending 4412"),
                ("invoice", "2026-02-invoice-contract-labor.pdf", "Mason Reed Consulting", 1300.0, "Research operations support — 13 hours", "13"),
                ("receipt", "2026-02-receipt-delta-airfare.pdf", "Delta Airlines", 780.0, "Austin to New York business travel", "Amex ending 1022"),
                ("receipt", "2026-02-receipt-client-meal.pdf", "Keen's Steakhouse", 160.0, "Client dinner after strategy workshop", "Amex ending 1022"),
                ("invoice", "2026-02-invoice-stripe-fees.pdf", "Stripe", 44.0, "Card processing and platform fees", "1"),
                ("receipt", "2026-02-receipt-training.pdf", "Coursera", 350.0, "Advanced analytics specialization", "Visa ending 4412"),
            ],
        },
        {
            "dir": "2026-03",
            "human": "March",
            "period": ("2026-03-01", "2026-03-31"),
            "income_total": 24800.0,
            "income_consulting": 15800.0,
            "income_retainers": 9000.0,
            "gross": 5300.0,
            "net": 4065.0,
            "docs": [
                ("receipt", "2026-03-receipt-meta-ads.pdf", "Meta Platforms Inc.", 980.0, "Facebook Ads — March expansion campaign", "Visa ending 4412"),
                ("invoice", "2026-03-invoice-wework.pdf", "WeWork", 600.0, "Coworking membership — March 2026", "1"),
                ("invoice", "2026-03-invoice-verizon.pdf", "Verizon Business", 120.0, "Business internet — March service", "1"),
                ("receipt", "2026-03-receipt-figma.pdf", "Figma", 45.0, "Professional design subscription — March", "Visa ending 4412"),
                ("invoice", "2026-03-invoice-contract-labor.pdf", "Mason Reed Consulting", 4200.0, "Sprint execution and delivery support — 42 hours", "42"),
                ("invoice", "2026-03-invoice-airbnb-lodging.pdf", "Airbnb", 1180.0, "New York workshop lodging", "2"),
                ("receipt", "2026-03-receipt-client-meal.pdf", "Carmine's", 210.0, "Team and client lunch after workshop", "Amex ending 1022"),
                ("invoice", "2026-03-invoice-stripe-fees.pdf", "Stripe", 59.0, "Card processing and platform fees", "1"),
                ("receipt", "2026-03-receipt-office-supplies.pdf", "Staples", 210.0, "Printer paper, notebooks, toner, folders", "Visa ending 4412"),
            ],
        },
        {
            "dir": "2026-04",
            "human": "April",
            "period": ("2026-04-01", "2026-04-30"),
            "income_total": 20100.0,
            "income_consulting": 11100.0,
            "income_retainers": 9000.0,
            "gross": 5400.0,
            "net": 4125.0,
            "docs": [
                ("receipt", "2026-04-receipt-meta-ads.pdf", "Meta Platforms Inc.", 1320.0, "Facebook Ads — April lead acceleration", "Visa ending 4412"),
                ("invoice", "2026-04-invoice-wework.pdf", "WeWork", 600.0, "Coworking membership — April 2026", "1"),
                ("invoice", "2026-04-invoice-verizon.pdf", "Verizon Business", 120.0, "Business internet — April service", "1"),
                ("receipt", "2026-04-receipt-figma.pdf", "Figma", 45.0, "Professional design subscription — April", "Visa ending 4412"),
                ("invoice", "2026-04-invoice-contract-labor.pdf", "Mason Reed Consulting", 1600.0, "Production support and QA — 16 hours", "16"),
                ("receipt", "2026-04-receipt-apple-hardware.pdf", "Apple Store", 2499.0, "MacBook Pro 14-inch for analytics and design work", "Apple Card ending 7811"),
                ("receipt", "2026-04-receipt-client-meal.pdf", "Union Square Cafe", 190.0, "Business lunch with recurring client", "Amex ending 1022"),
                ("invoice", "2026-04-invoice-stripe-fees.pdf", "Stripe", 52.0, "Card processing and platform fees", "1"),
                ("invoice", "2026-04-invoice-tax-license.pdf", "New York Department of State", 325.0, "Business filing and permit fees", "1"),
            ],
        },
    ]

    specs: List[DocSpec] = []
    for m in months:
        rel_dir = m["dir"]
        start, end = m["period"]
        month_num = rel_dir.split("-")[1]
        specs.append(
            income_statement(
                rel_dir,
                f"{rel_dir}-income-statement.pdf",
                start,
                end,
                m["income_total"],
                m["income_consulting"],
                m["income_retainers"],
            )
        )
        specs.append(
            payslip(
                rel_dir,
                f"{rel_dir}-payslip-orbitix.pdf",
                "Orbitix Systems",
                start,
                end,
                end,
                m["gross"],
                m["net"],
            )
        )
        day_map = {
            1: ["2026-01-09", "2026-01-11", "2026-01-13", "2026-01-15", "2026-01-18", "2026-01-21", "2026-01-24", "2026-01-27", "2026-01-29"],
            2: ["2026-02-06", "2026-02-08", "2026-02-10", "2026-02-12", "2026-02-15", "2026-02-18", "2026-02-20", "2026-02-24", "2026-02-26"],
            3: ["2026-03-05", "2026-03-07", "2026-03-10", "2026-03-12", "2026-03-14", "2026-03-18", "2026-03-22", "2026-03-25", "2026-03-28"],
            4: ["2026-04-04", "2026-04-06", "2026-04-08", "2026-04-10", "2026-04-14", "2026-04-17", "2026-04-20", "2026-04-24", "2026-04-27"],
        }
        dates = day_map[int(month_num)]
        for idx, doc in enumerate(m["docs"]):
            kind, filename, vendor, total, description, aux = doc
            date_iso = dates[idx]
            human = f"{m['human']} {int(date_iso[-2:])}, 2026"
            if kind == "receipt":
                specs.append(receipt(rel_dir, filename, vendor, human, date_iso, total, description, aux))
            else:
                specs.append(invoice(rel_dir, filename, vendor, human, date_iso, total, description, aux))
    return specs


def main():
    specs = build_specs()
    for spec in specs:
        render_pdf(spec)
    print(f"Generated {len(specs)} PDF files in {OUT_ROOT}")


if __name__ == "__main__":
    main()
