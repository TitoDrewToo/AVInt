from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple
from PIL import Image, ImageDraw, ImageFont
import textwrap


OUT_ROOT = Path("/Users/avin/Documents/AVINTELLIGENCE/Test Files/Stresstest/advancedanalytics_4mo_usd_spendpack")

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


@dataclass
class SpendDocSpec:
    rel_dir: str
    filename: str
    vendor: str
    title: str
    address: str
    date_human: str
    date_iso: str
    payment_method: str
    currency: str
    reference: str
    domain: str
    line_items: List[Tuple[str, str, float]]
    discount: float
    tax: float
    footer: List[str]


def money(amount: float, currency: str = "USD") -> str:
    symbol = {
        "USD": "$",
        "PHP": "PHP ",
        "JPY": "JPY ",
        "EUR": "EUR ",
    }.get(currency, f"{currency} ")
    return f"{symbol}{amount:,.2f}"


def draw_wrapped(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, font, fill="#0f0f0f", width_chars: int = 88, line_gap: int = 8):
    lines = textwrap.wrap(text, width=width_chars) or [text]
    cur_y = y
    for line in lines:
        draw.text((x, cur_y), line, font=font, fill=fill)
        cur_y += font.size + line_gap
    return cur_y


def render_pdf(spec: SpendDocSpec):
    out_dir = OUT_ROOT / spec.rel_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / spec.filename

    subtotal = round(sum(amount for _, _, amount in spec.line_items), 2)
    total = round(subtotal - spec.discount + spec.tax, 2)

    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)

    y = MARGIN
    for line in [spec.vendor, spec.address]:
        draw.text((MARGIN, y), line, font=FONT_BODY, fill="#111111")
        y += FONT_BODY.size + 6

    y += 18
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#222222", width=2)
    y += 26
    draw.text((MARGIN, y), spec.title, font=FONT_H1, fill="#111111")
    y += FONT_H1.size + 22

    meta = [
        ("Reference", spec.reference),
        ("Date", spec.date_human),
        ("Date ISO", spec.date_iso),
        ("Currency", spec.currency),
        ("Payment", spec.payment_method),
        ("Merchant Domain", spec.domain),
    ]
    left_x = MARGIN
    right_x = PAGE_W - MARGIN - 480
    meta_y = y
    for idx, (k, v) in enumerate(meta):
        target_x = left_x if idx % 2 == 0 else right_x
        target_y = meta_y + (idx // 2) * 42
        draw.text((target_x, target_y), f"{k}: {v}", font=FONT_BODY, fill="#222222")
    y = meta_y + ((len(meta) + 1) // 2) * 42 + 28

    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#d0d0d0", width=2)
    y += 24
    draw.text((MARGIN, y), "Description / Line Items", font=FONT_H2, fill="#111111")
    y += FONT_H2.size + 14

    draw.text((MARGIN, y), "Description", font=FONT_SMALL, fill="#444444")
    draw.text((PAGE_W - MARGIN - 210, y), "Qty", font=FONT_SMALL, fill="#444444")
    draw.text((PAGE_W - MARGIN - 100, y), "Amount", font=FONT_SMALL, fill="#444444")
    y += FONT_SMALL.size + 12
    draw.line((MARGIN, y, PAGE_W - MARGIN, y), fill="#e0e0e0", width=1)
    y += 16

    for desc, qty, amt in spec.line_items:
        y = draw_wrapped(draw, desc, MARGIN, y, FONT_BODY, width_chars=60, line_gap=5)
        draw.text((PAGE_W - MARGIN - 210, y - FONT_BODY.size - 5), qty, font=FONT_BODY, fill="#222222")
        draw.text((PAGE_W - MARGIN - 160, y - FONT_BODY.size - 5), money(amt, spec.currency), font=FONT_BODY, fill="#222222")
        y += 14

    y += 10
    draw.line((PAGE_W - MARGIN - 380, y, PAGE_W - MARGIN, y), fill="#d0d0d0", width=1)
    y += 18
    totals = [
        ("Subtotal", money(subtotal, spec.currency)),
        ("Discount", f"({money(spec.discount, spec.currency)})" if spec.discount > 0 else money(0, spec.currency)),
        ("Tax", money(spec.tax, spec.currency)),
        ("TOTAL", money(total, spec.currency)),
    ]
    for label, value in totals:
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


def build_specs() -> List[SpendDocSpec]:
    def receipt(
        rel_dir: str,
        filename: str,
        vendor: str,
        address: str,
        date_human: str,
        date_iso: str,
        payment_method: str,
        domain: str,
        line_items: List[Tuple[str, str, float]],
        discount: float = 0.0,
        tax: float = 0.0,
        currency: str = "USD",
        title: str = "RECEIPT",
    ) -> SpendDocSpec:
        return SpendDocSpec(
            rel_dir=rel_dir,
            filename=filename,
            vendor=vendor,
            title=title,
            address=address,
            date_human=date_human,
            date_iso=date_iso,
            payment_method=payment_method,
            currency=currency,
            reference=filename.replace(".pdf", "").upper(),
            domain=domain,
            line_items=line_items,
            discount=discount,
            tax=tax,
            footer=[
                "Prepared to stress merchant-domain, vendor concentration, discount, and geography-aware analytics.",
                "Merchant address, payment method, and totals are intentionally explicit for normalization and dashboard testing.",
            ],
        )

    specs: List[SpendDocSpec] = []

    # January - baseline recurring spend
    specs.extend([
        receipt("2026-01", "2026-01-03-sweetgreen-midtown-lunch.pdf", "Sweetgreen", "1166 Avenue of the Americas, Midtown Manhattan, New York NY 10036", "January 3, 2026", "2026-01-03", "Visa ending 4412", "Food / Restaurants", [("Harvest Bowl lunch set", "1", 16.50), ("Sparkling water", "1", 3.50)], tax=1.78),
        receipt("2026-01", "2026-01-05-starbucks-soho-breakfast.pdf", "Starbucks", "72 Spring Street, SoHo, New York NY 10012", "January 5, 2026", "2026-01-05", "Apple Pay", "Food / Restaurants", [("Latte", "1", 5.45), ("Ham and swiss croissant", "1", 6.25)], tax=1.04),
        receipt("2026-01", "2026-01-07-wholefoods-columbus-grocery.pdf", "Whole Foods Market", "808 Columbus Avenue, Upper West Side, New York NY 10025", "January 7, 2026", "2026-01-07", "Amex ending 8008", "Grocery / Household", [("Organic produce and pantry staples", "1", 41.30), ("Household essentials", "1", 18.70)], discount=6.00, tax=4.97),
        receipt("2026-01", "2026-01-10-verizon-wireless-bill.pdf", "Verizon", "Billing Center · 1095 Avenue of the Americas, New York NY 10036", "January 10, 2026", "2026-01-10", "Debit ending 2104", "Utilities / Telecom", [("Wireless plan - January", "1", 78.00), ("Device protection", "1", 12.00)], tax=0.00, title="BILLING STATEMENT"),
        receipt("2026-01", "2026-01-12-figma-team-plan.pdf", "Figma", "760 Market Street, San Francisco CA 94102", "January 12, 2026", "2026-01-12", "Mastercard ending 1277", "Software / SaaS", [("Professional plan - January", "1", 45.00), ("Additional editor seat", "1", 15.00)], tax=0.00, title="INVOICE"),
        receipt("2026-01", "2026-01-14-uber-midtown-to-williamsburg.pdf", "Uber", "Trip service record · Manhattan to Williamsburg, New York NY", "January 14, 2026", "2026-01-14", "Visa ending 4412", "Transport / Rideshare", [("Crosstown ride", "1", 24.20), ("Booking fee", "1", 2.50)], tax=2.37),
        receipt("2026-01", "2026-01-17-staples-flatiron-office-supplies.pdf", "Staples", "5 Union Square West, Flatiron, New York NY 10003", "January 17, 2026", "2026-01-17", "Cash", "Office / Supplies", [("Printer paper bundle", "1", 22.00), ("Pens and notebooks", "1", 14.80)], discount=4.50, tax=2.88),
        receipt("2026-01", "2026-01-19-uniqlo-soho-winter-basics.pdf", "UNIQLO", "546 Broadway, SoHo, New York NY 10012", "January 19, 2026", "2026-01-19", "Mastercard ending 1277", "Fashion / Apparel", [("Heattech tops", "2", 39.80), ("Socks set", "1", 12.90)], discount=8.70, tax=3.91),
        receipt("2026-01", "2026-01-21-traderjoes-chelsea-grocery.pdf", "Trader Joe's", "675 Avenue of the Americas, Chelsea, New York NY 10010", "January 21, 2026", "2026-01-21", "Debit ending 2104", "Grocery / Household", [("Weekly groceries", "1", 36.25), ("Frozen meals and snacks", "1", 17.40)], tax=0.00),
        receipt("2026-01", "2026-01-24-chipotle-flatiron-dinner.pdf", "Chipotle", "864 Broadway, Flatiron, New York NY 10003", "January 24, 2026", "2026-01-24", "Apple Pay", "Food / Restaurants", [("Chicken bowl", "1", 14.35), ("Chips and guacamole", "1", 6.25)], tax=1.84),
        receipt("2026-01", "2026-01-27-cvs-ues-pharmacy-essentials.pdf", "CVS Pharmacy", "1396 2nd Avenue, Upper East Side, New York NY 10021", "January 27, 2026", "2026-01-27", "Visa ending 4412", "Health / Pharmacy", [("Pharmacy essentials", "1", 24.80), ("Toiletries", "1", 11.50)], discount=3.20, tax=2.68),
        receipt("2026-01", "2026-01-29-google-workspace-bill.pdf", "Google Workspace", "Cloud billing center · New York NY 10011", "January 29, 2026", "2026-01-29", "Amex ending 8008", "Software / SaaS", [("Workspace Business Standard", "1", 14.40), ("Additional storage", "1", 6.00)], tax=0.00, title="INVOICE"),
    ])

    # February - travel and dining lift
    specs.extend([
        receipt("2026-02", "2026-02-02-sweetgreen-midtown-lunch.pdf", "Sweetgreen", "1166 Avenue of the Americas, Midtown Manhattan, New York NY 10036", "February 2, 2026", "2026-02-02", "Visa ending 4412", "Food / Restaurants", [("Kale caesar bowl", "1", 16.90), ("Iced tea", "1", 3.20)], tax=1.79),
        receipt("2026-02", "2026-02-04-starbucks-soho-breakfast.pdf", "Starbucks", "72 Spring Street, SoHo, New York NY 10012", "February 4, 2026", "2026-02-04", "Apple Pay", "Food / Restaurants", [("Flat white", "1", 5.75), ("Breakfast sandwich", "1", 6.85)], tax=1.11),
        receipt("2026-02", "2026-02-06-delta-jfk-aus-flight.pdf", "Delta Air Lines", "JFK Terminal 4 departure · New York NY 11430", "February 6, 2026", "2026-02-06", "Amex ending 8008", "Travel / Lodging", [("JFK to Austin economy fare", "1", 248.00), ("Seat selection", "1", 24.00)], tax=19.40),
        receipt("2026-02", "2026-02-07-marriott-austin-downtown-stay.pdf", "Marriott Austin Downtown", "304 E Cesar Chavez Street, Downtown Austin TX 78701", "February 7, 2026", "2026-02-07", "Visa ending 4412", "Travel / Lodging", [("Hotel room - 1 night", "1", 229.00), ("City destination fee", "1", 18.00)], tax=41.42, title="INVOICE"),
        receipt("2026-02", "2026-02-08-uber-austin-airport-trip.pdf", "Uber", "Airport to Downtown Austin route · Austin TX", "February 8, 2026", "2026-02-08", "Visa ending 4412", "Transport / Rideshare", [("Airport ride", "1", 29.80), ("Booking fee", "1", 2.75)], tax=2.66),
        receipt("2026-02", "2026-02-11-wholefoods-austin-downtown-grocery.pdf", "Whole Foods Market", "525 N Lamar Blvd, Downtown Austin TX 78703", "February 11, 2026", "2026-02-11", "Mastercard ending 1277", "Grocery / Household", [("Groceries", "1", 48.50), ("Ready meals and drinks", "1", 19.30)], discount=7.50, tax=4.99),
        receipt("2026-02", "2026-02-14-shakeshack-south-congress-dinner.pdf", "Shake Shack", "1100 South Congress Avenue, Austin TX 78704", "February 14, 2026", "2026-02-14", "Apple Pay", "Food / Restaurants", [("Burger combo dinner", "2", 24.60), ("Frozen custard", "1", 6.90)], tax=2.57),
        receipt("2026-02", "2026-02-16-notion-plus-plan.pdf", "Notion", "Billing operations · San Francisco CA 94103", "February 16, 2026", "2026-02-16", "Mastercard ending 1277", "Software / SaaS", [("Plus plan - February", "1", 20.00), ("AI add-on", "1", 10.00)], tax=0.00, title="INVOICE"),
        receipt("2026-02", "2026-02-18-nike-domain-running-gear.pdf", "Nike", "1120 S Congress Avenue, Austin TX 78704", "February 18, 2026", "2026-02-18", "Amex ending 8008", "Fashion / Apparel", [("Running shorts", "1", 48.00), ("Training tee", "1", 34.00), ("Cap", "1", 22.00)], discount=16.00, tax=7.80),
        receipt("2026-02", "2026-02-21-att-mobile-bill.pdf", "AT&T", "Billing center · 208 S Akard Street, Dallas TX 75202", "February 21, 2026", "2026-02-21", "Debit ending 2104", "Utilities / Telecom", [("Wireless service - February", "1", 74.00), ("International day pass", "1", 10.00)], tax=0.00, title="BILLING STATEMENT"),
        receipt("2026-02", "2026-02-25-chipotle-south-congress-lunch.pdf", "Chipotle", "801 Congress Avenue, Austin TX 78701", "February 25, 2026", "2026-02-25", "Cash", "Food / Restaurants", [("Steak bowl", "1", 15.10), ("Chips and drink", "1", 5.85)], tax=1.82),
        receipt("2026-02", "2026-02-27-traderjoes-chelsea-grocery.pdf", "Trader Joe's", "675 Avenue of the Americas, Chelsea, New York NY 10010", "February 27, 2026", "2026-02-27", "Debit ending 2104", "Grocery / Household", [("Weekly groceries", "1", 39.20), ("Frozen entrees", "1", 18.90)], discount=2.50, tax=0.00),
    ])

    # March - fashion and dining spike
    specs.extend([
        receipt("2026-03", "2026-03-03-sweetgreen-midtown-lunch.pdf", "Sweetgreen", "1166 Avenue of the Americas, Midtown Manhattan, New York NY 10036", "March 3, 2026", "2026-03-03", "Visa ending 4412", "Food / Restaurants", [("Crispy rice bowl", "1", 17.40), ("Sparkling water", "1", 3.80)], tax=1.87),
        receipt("2026-03", "2026-03-05-zara-soho-spring-order.pdf", "ZARA", "503 Broadway, SoHo, New York NY 10012", "March 5, 2026", "2026-03-05", "Mastercard ending 1277", "Fashion / Apparel", [("Spring overshirt", "1", 79.90), ("Trousers", "1", 69.90)], discount=22.00, tax=11.35),
        receipt("2026-03", "2026-03-07-uniqlo-flatiron-seasonal-refresh.pdf", "UNIQLO", "31 W 34th Street, Midtown South, New York NY 10001", "March 7, 2026", "2026-03-07", "Apple Pay", "Fashion / Apparel", [("Oxford shirts", "2", 69.80), ("Light jacket", "1", 59.90)], discount=18.00, tax=9.93),
        receipt("2026-03", "2026-03-09-starbucks-soho-breakfast.pdf", "Starbucks", "72 Spring Street, SoHo, New York NY 10012", "March 9, 2026", "2026-03-09", "Apple Pay", "Food / Restaurants", [("Cold brew", "1", 5.65), ("Egg bites", "1", 6.75)], tax=1.11),
        receipt("2026-03", "2026-03-11-wholefoods-columbus-grocery.pdf", "Whole Foods Market", "808 Columbus Avenue, Upper West Side, New York NY 10025", "March 11, 2026", "2026-03-11", "Amex ending 8008", "Grocery / Household", [("Groceries", "1", 44.60), ("Household restock", "1", 21.50)], discount=5.20, tax=5.14),
        receipt("2026-03", "2026-03-14-shakeshack-williamsburg-dinner.pdf", "Shake Shack", "30 N 3rd Street, Williamsburg, Brooklyn NY 11249", "March 14, 2026", "2026-03-14", "Visa ending 4412", "Food / Restaurants", [("Dinner for two", "1", 28.70), ("Fries and drinks", "1", 8.60)], tax=3.31),
        receipt("2026-03", "2026-03-16-nike-flatiron-apparel-order.pdf", "Nike", "650 5th Avenue, Midtown Manhattan, New York NY 10019", "March 16, 2026", "2026-03-16", "Amex ending 8008", "Fashion / Apparel", [("Training pants", "1", 68.00), ("Running top", "1", 42.00), ("Socks", "1", 16.00)], discount=20.00, tax=8.34),
        receipt("2026-03", "2026-03-18-uber-chelsea-to-williamsburg.pdf", "Uber", "Chelsea to Williamsburg route · New York NY", "March 18, 2026", "2026-03-18", "Visa ending 4412", "Transport / Rideshare", [("Crosstown ride", "1", 26.10), ("Booking fee", "1", 2.85)], tax=2.52),
        receipt("2026-03", "2026-03-21-chipotle-flatiron-dinner.pdf", "Chipotle", "864 Broadway, Flatiron, New York NY 10003", "March 21, 2026", "2026-03-21", "Cash", "Food / Restaurants", [("Chicken bowl", "1", 14.75), ("Drink and side", "1", 5.95)], tax=1.84),
        receipt("2026-03", "2026-03-24-cvs-ues-pharmacy-essentials.pdf", "CVS Pharmacy", "1396 2nd Avenue, Upper East Side, New York NY 10021", "March 24, 2026", "2026-03-24", "Debit ending 2104", "Health / Pharmacy", [("Health essentials", "1", 23.40), ("Toiletries", "1", 14.80)], discount=2.70, tax=2.82),
        receipt("2026-03", "2026-03-27-figma-team-plan.pdf", "Figma", "760 Market Street, San Francisco CA 94102", "March 27, 2026", "2026-03-27", "Mastercard ending 1277", "Software / SaaS", [("Professional plan - March", "1", 45.00), ("Additional editor seat", "1", 15.00)], tax=0.00, title="INVOICE"),
        receipt("2026-03", "2026-03-30-wholefoods-columbus-grocery-2.pdf", "Whole Foods Market", "808 Columbus Avenue, Upper West Side, New York NY 10025", "March 30, 2026", "2026-03-30", "Amex ending 8008", "Grocery / Household", [("Weekly groceries", "1", 38.70), ("Fresh produce", "1", 16.20)], discount=4.00, tax=4.42),
    ])

    # April - gadget spike + more travel + discount-heavy retail
    specs.extend([
        receipt("2026-04", "2026-04-02-apple-soho-macbook-accessories.pdf", "Apple Store", "103 Prince Street, SoHo, New York NY 10012", "April 2, 2026", "2026-04-02", "Amex ending 8008", "Gadgets / Equipment", [("Magic Keyboard", "1", 179.00), ("USB-C adapter", "1", 49.00), ("Protective sleeve", "1", 39.00)], discount=12.00, tax=22.68),
        receipt("2026-04", "2026-04-04-bestbuy-chelsea-monitor-deal.pdf", "Best Buy", "60 W 23rd Street, Chelsea, New York NY 10010", "April 4, 2026", "2026-04-04", "Visa ending 4412", "Gadgets / Equipment", [("27-inch monitor", "1", 269.99), ("HDMI cable", "1", 24.99)], discount=35.00, tax=22.07),
        receipt("2026-04", "2026-04-06-bhphoto-midtown-keyboard-mouse.pdf", "B&H Photo", "420 9th Avenue, Midtown West, New York NY 10001", "April 6, 2026", "2026-04-06", "Mastercard ending 1277", "Gadgets / Equipment", [("Mechanical keyboard", "1", 129.00), ("Wireless mouse", "1", 79.00)], discount=18.00, tax=17.84),
        receipt("2026-04", "2026-04-08-sweetgreen-midtown-lunch.pdf", "Sweetgreen", "1166 Avenue of the Americas, Midtown Manhattan, New York NY 10036", "April 8, 2026", "2026-04-08", "Apple Pay", "Food / Restaurants", [("Guacamole greens bowl", "1", 17.90), ("Still water", "1", 3.00)], tax=1.85),
        receipt("2026-04", "2026-04-10-starbucks-soho-breakfast.pdf", "Starbucks", "72 Spring Street, SoHo, New York NY 10012", "April 10, 2026", "2026-04-10", "Apple Pay", "Food / Restaurants", [("Oat milk latte", "1", 5.95), ("Breakfast wrap", "1", 7.25)], tax=1.16),
        receipt("2026-04", "2026-04-13-wholefoods-columbus-grocery.pdf", "Whole Foods Market", "808 Columbus Avenue, Upper West Side, New York NY 10025", "April 13, 2026", "2026-04-13", "Debit ending 2104", "Grocery / Household", [("Groceries", "1", 42.90), ("Household restock", "1", 19.60)], discount=5.50, tax=4.94),
        receipt("2026-04", "2026-04-15-verizon-wireless-bill.pdf", "Verizon", "Billing Center · 1095 Avenue of the Americas, New York NY 10036", "April 15, 2026", "2026-04-15", "Debit ending 2104", "Utilities / Telecom", [("Wireless plan - April", "1", 78.00), ("Device protection", "1", 12.00)], tax=0.00, title="BILLING STATEMENT"),
        receipt("2026-04", "2026-04-18-uber-jfk-airport-trip.pdf", "Uber", "Upper West Side to JFK route · New York NY", "April 18, 2026", "2026-04-18", "Visa ending 4412", "Transport / Rideshare", [("Airport ride", "1", 47.00), ("Booking fee", "1", 3.40)], tax=4.05),
        receipt("2026-04", "2026-04-20-marriott-soma-sanfrancisco-stay.pdf", "Marriott Marquis San Francisco", "780 Mission Street, SoMa, San Francisco CA 94103", "April 20, 2026", "2026-04-20", "Visa ending 4412", "Travel / Lodging", [("Hotel room - 1 night", "1", 312.00), ("Urban destination fee", "1", 24.00)], tax=52.58, title="INVOICE"),
        receipt("2026-04", "2026-04-22-delta-sfo-jfk-flight.pdf", "Delta Air Lines", "SFO Terminal 1 departure · San Francisco CA 94128", "April 22, 2026", "2026-04-22", "Amex ending 8008", "Travel / Lodging", [("San Francisco to JFK fare", "1", 286.00), ("Seat selection", "1", 29.00)], tax=22.46),
        receipt("2026-04", "2026-04-25-zara-soho-promo-order.pdf", "ZARA", "503 Broadway, SoHo, New York NY 10012", "April 25, 2026", "2026-04-25", "Mastercard ending 1277", "Fashion / Apparel", [("Shirt jacket", "1", 89.90), ("Tee bundle", "1", 32.90)], discount=24.00, tax=8.77),
        receipt("2026-04", "2026-04-28-chipotle-flatiron-dinner.pdf", "Chipotle", "864 Broadway, Flatiron, New York NY 10003", "April 28, 2026", "2026-04-28", "Cash", "Food / Restaurants", [("Steak bowl", "1", 15.25), ("Drink and chips", "1", 6.10)], tax=1.90),
    ])

    return specs


def main():
    specs = build_specs()
    for spec in specs:
      render_pdf(spec)
    print(f"Generated {len(specs)} PDFs in {OUT_ROOT}")


if __name__ == "__main__":
    main()
