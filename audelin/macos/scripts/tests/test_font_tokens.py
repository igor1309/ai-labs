import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "check-font-tokens.py"
spec = importlib.util.spec_from_file_location("check_font_tokens", SCRIPT)
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class FontTokensTests(unittest.TestCase):

    def test_ui_modules_use_only_token_fonts(self):
        self.assertEqual(check.violations(), [])

    def test_raw_fonts_are_reported_outside_glass_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "Sources/A").mkdir(parents=True)
            (root / "Sources/GlassLedger").mkdir(parents=True)
            (root / "App/Sources/B").mkdir(parents=True)
            (root / "Sources/A/A.swift").write_text(
                "Text(\"a\").font(.system(size: 16))\n"
                "let f = NSFont.systemFont(ofSize: 13)\n"
                "let m = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)\n"
                "Text(\"b\").font(.caption)\n"
                "Text(\"c\").font(tokens.ui(tokens.typeBody))\n"
                "// .system(size: 1) in a comment\n")
            (root / "App/Sources/B/B.swift").write_text("let f = NSFont(name: \"X\", size: 3)\n")
            (root / "Sources/GlassLedger/G.swift").write_text("let f = NSFont.systemFont(ofSize: 13)\n")
            found = check.violations(root)
        self.assertEqual([item.split(":")[0] + ":" + item.split(":")[1] for item in found],
                         ["Sources/A/A.swift:1", "Sources/A/A.swift:2", "Sources/A/A.swift:3",
                          "Sources/A/A.swift:4", "App/Sources/B/B.swift:1"])


if __name__ == "__main__":
    unittest.main()
