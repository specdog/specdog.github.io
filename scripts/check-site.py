#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "site-map.json"


def main() -> int:
    data = json.loads(MANIFEST.read_text())
    nav_links = data["nav"]
    skip = set(data["skip"])
    pages = data["pages"]
    issues = []

    for page in pages:
        path = page["path"]
        if path == "/":
            p = ROOT / "index.html"
        elif path.endswith("/"):
            p = ROOT / path.lstrip("/") / "index.html"
        else:
            p = ROOT / (path.lstrip("/") + ".html")

        if not p.exists():
            issues.append(f"missing page: {path}")
            continue
        if p.name in skip:
            continue

        s = p.read_text()
        if "<nav>" not in s or "</nav>" not in s:
            issues.append(f"missing nav: {p.name}")
            continue
        for link in nav_links:
            if link not in s:
                issues.append(f"missing nav link {link} in {p.name}")

    if issues:
        print("SITE CHECK FAILED")
        for i in issues:
            print(i)
        return 1
    print("SITE CHECK OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
