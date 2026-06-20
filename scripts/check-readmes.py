#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "readme-map.json"


def main() -> int:
    data = json.loads(MANIFEST.read_text())
    issues = []
    for item in data["files"]:
        p = Path(item["path"])
        if not p.exists():
            issues.append(f"missing file: {p}")
            continue
        text = p.read_text()
        for needle in item["mustContain"]:
            if needle not in text:
                issues.append(f"missing '{needle}' in {p}")
    if issues:
        print("README CHECK FAILED")
        for issue in issues:
            print(issue)
        return 1
    print("README CHECK OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
