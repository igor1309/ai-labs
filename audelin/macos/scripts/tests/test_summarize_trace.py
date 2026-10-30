import contextlib
import importlib.util
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "summarize-trace.py"
FIXTURES = Path(__file__).with_name("fixtures")
spec = importlib.util.spec_from_file_location("summarize_trace", SCRIPT)
trace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trace)


class SummaryTests(unittest.TestCase):
    def summary(self, version):
        return trace.summarize(
            FIXTURES / f"profile-{version}.xml", FIXTURES / f"hangs-{version}.xml",
            "AudelinRehearsal", FIXTURES / f"signposts-{version}.xml")

    def rendered(self, version, top=20):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            trace.report(self.summary(version), top)
        return output.getvalue()

    def test_signposts_resolve_references_and_report_complete_app_intervals(self):
        text = self.rendered("old")
        self.assertIn("PanelUpdate: count 2, total 4.0 ms, longest 3.0 ms", text)
        self.assertIn("TranscriptWrite: count 1, total 2.0 ms, longest 2.0 ms", text)
        self.assertIn("Hearing: count 1, total 1.0 ms, longest 1.0 ms", text)
        self.assertIn("main thread: 20.0% of sampled CPU", text)
        self.assertIn("hangs: 1, total 200.0 ms, longest 200.0 ms", text)
        summary = self.summary("old")
        self.assertEqual(summary["inclusive_ns"]["caller"], 4_000_000)
        self.assertNotIn("AudelinRehearsal_main", summary["inclusive_ns"])
        self.assertEqual(summary["self_ns"]["system"], 3_000_000)

    def test_compare_cli_uses_all_frames_even_below_displayed_top(self):
        with tempfile.TemporaryDirectory() as folder:
            old, new = [Path(folder) / name for name in ("old.txt", "new.txt")]
            old.write_text("rehearsal: done\n" + self.rendered("old", top=0))
            new.write_text(self.rendered("new", top=0))
            result = subprocess.run([sys.executable, "-I", str(SCRIPT), "--compare", str(old), str(new)],
                                    capture_output=True, text=True, check=True)
        text = result.stdout
        self.assertIn("frames by self time:\n+3.0 ms  leaf\n+1.0 ms  newOnly", text)
        self.assertIn("frames by inclusive time:\n+3.0 ms  leaf\n+1.0 ms  caller\n+1.0 ms  newOnly", text)
        self.assertNotIn("oldOnly", text)
        self.assertIn("20.0% -> 80.0% (+60.0 percentage points)", text)
        self.assertIn("hangs: count +1, total +200.0 ms, longest +100.0 ms", text)
        self.assertIn("PanelUpdate: count -1, total +2.0 ms, longest +3.0 ms", text)
        self.assertIn("Hearing: count +1, total +5.0 ms, longest +3.0 ms", text)
        self.assertIn("TranscriptWrite: count +0, total +1.0 ms, longest +1.0 ms", text)

    def test_compare_reports_no_frame_growth_and_removed_intervals(self):
        old = self.summary("old")
        new = self.summary("old")
        new["intervals"] = {}
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            trace.compare(old, new)
        self.assertEqual(output.getvalue().count("no growth"), 2)
        self.assertIn("PanelUpdate: count -2, total -4.0 ms, longest -3.0 ms", output.getvalue())

    def test_empty_tables_have_zero_counts(self):
        with tempfile.TemporaryDirectory() as folder:
            empty = Path(folder) / "empty.xml"
            empty.write_text("<trace-query-result><node/></trace-query-result>")
            summary = trace.summarize(empty, empty, "app", empty)
        self.assertEqual(trace.share(summary), 0)
        self.assertEqual(summary["hangs"], {"count": 0, "total_ns": 0, "longest_ns": 0})
        self.assertEqual(summary["intervals"], {})

    def test_legacy_summary_fails_with_actionable_message(self):
        with tempfile.TemporaryDirectory() as folder:
            legacy = Path(folder) / "summary.txt"
            legacy.write_text("samples: 100 ms of CPU")
            with self.assertRaisesRegex(ValueError, "regenerate with this summarizer"):
                trace.read_summary(legacy)


if __name__ == "__main__":
    unittest.main()
