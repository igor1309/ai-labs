#!/usr/bin/env python3
"""Fail when product UI code sets a font without the Glass Ledger tokens.

Fonts come from `tokens.ui(...)`, `tokens.data(...)`, `tokens.nsUi(...)` and
`tokens.nsData(...)`, sized by `type-*` tokens. Only the GlassLedger module,
which resolves those tokens, may call the system font APIs.

    python3 -I scripts/check-font-tokens.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCANNED = ("Sources", "App/Sources")
ALLOWED = ("Sources/GlassLedger/",)

PATTERNS = {
    r"\.system\(\s*size:": "Font.system(size:)",
    r"\.system\(\s*\.(largeTitle|title\d?|headline|subheadline|body|callout|footnote|caption\d?)\b": "Font.system(<text style>)",
    r"\.font\(\s*\.(largeTitle|title\d?|headline|subheadline|body|callout|footnote|caption\d?)\b": "SwiftUI text style",
    r"\.custom\(": "Font.custom",
    r"\b(systemFont|boldSystemFont|monospacedSystemFont|monospacedDigitSystemFont|userFont|userFixedPitchFont)\(\s*ofSize:": "NSFont system font",
    r"NSFont\(\s*(name|descriptor):": "NSFont(name:/descriptor:)",
    r"\.preferredFont\(": "NSFont.preferredFont",
}


def violations(root=ROOT):
    found = []
    for folder in SCANNED:
        for path in sorted((root / folder).rglob("*.swift")):
            rel = path.relative_to(root).as_posix()
            if rel.startswith(ALLOWED):
                continue
            for number, line in enumerate(path.read_text().splitlines(), 1):
                code = line.split("//", 1)[0]
                for pattern, name in PATTERNS.items():
                    if re.search(pattern, code):
                        found.append(f"{rel}:{number}: {name}; use tokens.ui/data/nsUi/nsData with a type-* token")
    return found


def main():
    found = violations()
    for item in found:
        print(item)
    if found:
        sys.exit(1)
    print("ok: every font comes from the Glass Ledger tokens")


if __name__ == "__main__":
    main()
