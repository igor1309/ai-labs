import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location(
    "generate_tokens", Path(__file__).resolve().parents[1] / "generate-tokens.py"
)
generator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(generator)


def entry(mode, value):
    return {"theme": {"mode": mode}, "value": value}


class GenerateTokensTests(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.snapshot = Path(folder.name) / "tokens.json"
        self.output = Path(folder.name) / "Sources/Tokens.swift"

    def run_generator(self, variables, *arguments):
        self.snapshot.write_text(json.dumps({"variables": variables}))
        output = io.StringIO()
        with contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            status = generator.main([
                "--snapshot", str(self.snapshot),
                "--output", str(self.output), *arguments,
            ])
        return status, output.getvalue()

    def test_colours_with_modes_in_either_order_and_unthemed_tokens(self):
        modes = [entry("dark", "#12345680"), entry("light", "#ABCDEF")]
        for values in (modes, list(reversed(modes))):
            with self.subTest(values=values):
                variables = {
                    "mz-ground": {"type": "color", "value": values},
                    "mz-host-hi": {"type": "color", "value": "#112233"},
                    "mz-space-12": {"type": "number", "value": 12.5},
                    "mz-font-text": {"type": "string", "value": 'Font "Name"'},
                    "exploration": {"type": "color", "value": [{"theme": {"palette": "other"}}]},
                }
                status, message = self.run_generator(variables)
                self.assertEqual(status, 0, message)
                swift = self.output.read_text()
                self.assertIn(
                    "public static let ground = Color(AppearanceColor(dark: Color.hex(0x123456, 0x80), light: Color.hex(0xABCDEF, 0xFF)))",
                    swift,
                )
                self.assertIn("public static let hostHi = Color.hex(0x112233, 0xFF)", swift)
                self.assertIn("public static let space12: CGFloat = 12.5", swift)
                self.assertIn('public static let fontText = "Font \\"Name\\""', swift)
                self.assertNotIn("exploration", swift)
                status, message = self.run_generator(variables, "--check")
                self.assertEqual(status, 0, message)
                self.assertEqual(message.strip(), "ok: 4 tokens")

    def test_rejects_invalid_themes_without_writing(self):
        dark = entry("dark", "#123456")
        light = entry("light", "#ABCDEF")
        cases = {
            "other axis": ("color", [{"theme": {"palette": "dark"}, "value": "#123456"}, light]),
            "extra axis": ("color", [{"theme": {"mode": "dark", "palette": "original"}, "value": "#123456"}, light]),
            "missing light": ("color", [dark]),
            "missing dark": ("color", [light]),
            "no modes": ("color", []),
            "repeated dark": ("color", [dark, dark, light]),
            "repeated light": ("color", [dark, light, light]),
            "unknown mode": ("color", [dark, entry("sepia", "#ABCDEF")]),
            "invalid mode": ("color", [dark, entry(["light"], "#ABCDEF")]),
            "missing theme": ("color", [{"value": "#123456"}, light]),
            "empty theme": ("color", [{"theme": {}, "value": "#123456"}, light]),
            "missing mode value": ("color", [{"theme": {"mode": None}, "value": "#123456"}, light]),
            "invalid entry": ("color", ["#123456", light]),
            "invalid container": ("color", {"dark": "#123456", "light": "#ABCDEF"}),
            "invalid colour": ("color", [entry("dark", "#123"), light]),
            "missing colour": ("color", [{"theme": {"mode": "dark"}}, light]),
            "themed number": ("number", [entry("dark", 1), entry("light", 2)]),
            "themed string": ("string", [entry("dark", "A"), entry("light", "B")]),
        }
        for label, (kind, value) in cases.items():
            with self.subTest(label=label):
                status, message = self.run_generator({"mz-invalid": {"type": kind, "value": value}})
                self.assertNotEqual(status, 0)
                self.assertIn("mz-invalid", message)
                self.assertFalse(self.output.exists())

    def test_check_rejects_missing_and_stale_output(self):
        variables = {"mz-ground": {"type": "color", "value": "#123456"}}
        status, message = self.run_generator(variables, "--check")
        self.assertEqual(status, 1)
        self.assertIn("stale:", message)
        self.assertFalse(self.output.exists())

        status, message = self.run_generator(variables)
        self.assertEqual(status, 0, message)
        original = self.output.read_text()
        variables["mz-ground"]["value"] = "#ABCDEF"
        status, message = self.run_generator(variables, "--check")
        self.assertEqual(status, 1)
        self.assertIn("stale:", message)
        self.assertEqual(self.output.read_text(), original)


if __name__ == "__main__":
    unittest.main()
