#!/usr/bin/env python3
"""Small, dependency-free reconciliation exercise for synthetic CSVs."""

from __future__ import annotations

import csv
import sys
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path


def read_rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def key(row: dict[str, str]) -> str:
    return (row.get("transaction_id") or row.get("order_id") or "").strip()


def amount(row: dict[str, str], field: str = "gross_revenue") -> Decimal | None:
    value = next(((row.get(candidate) or "").strip() for candidate in (field, "sales_amount") if row.get(candidate)), "")
    if not value:
        return None
    try:
        return Decimal(value.replace(",", ""))
    except InvalidOperation:
        return None


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: analyst_reconciliation.py SOURCE_A.csv SOURCE_B.csv", file=sys.stderr)
        return 2
    left_path, right_path = map(Path, sys.argv[1:])
    left, right = read_rows(left_path), read_rows(right_path)
    left_keys, right_keys = Counter(key(row) for row in left), Counter(key(row) for row in right)
    all_keys = sorted(set(left_keys) | set(right_keys))
    left_by_key = {key(row): row for row in left if key(row)}
    right_by_key = {key(row): row for row in right if key(row)}
    findings: list[tuple[str, str, str]] = []
    matched = conflicts = 0
    for transaction_id in all_keys:
        if left_keys[transaction_id] > 1 or right_keys[transaction_id] > 1:
            findings.append(("duplicate", transaction_id, "duplicate key"))
            continue
        a, b = left_by_key.get(transaction_id), right_by_key.get(transaction_id)
        if a is None:
            findings.append(("missing_from_a", transaction_id, "key only in source B"))
        elif b is None:
            findings.append(("missing_from_b", transaction_id, "key only in source A"))
        elif amount(a) != amount(b):
            conflicts += 1
            findings.append(("conflict", transaction_id, f"gross_revenue {a.get('gross_revenue')} != {b.get('gross_revenue')}"))
        else:
            matched += 1
    comparable = max(len(left), len(right), 1)
    print(f"source_a_rows={len(left)}")
    print(f"source_b_rows={len(right)}")
    print(f"matched={matched}")
    print(f"conflicts={conflicts}")
    print(f"exceptions={len(findings)}")
    print(f"reconciliation_rate={matched / comparable:.4%}")
    print("\nfindings:")
    for classification, transaction_id, reason in findings:
        print(f"{classification}\t{transaction_id}\t{reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
