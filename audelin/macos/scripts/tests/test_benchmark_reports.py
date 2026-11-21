import contextlib
import io
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch


BENCHMARKS = Path(__file__).resolve().parents[2] / "Benchmarks"
LENGTHS = (20, 800, 1620, 6000)


def results(baseline, samples):
    text = f"## Baseline '{baseline}'\n"
    for sample, count, unit, values in samples:
        cells = " | ".join(str(value) for value in values)
        text += f"""### One {sample} with {count} lines in the panel
| Metric | p0 | p25 | p50 | p75 | p90 | p99 | p100 | Samples |
|---|---|---|---|---|---|---|---|---|
| Instructions ({unit}) * | {cells} | 100 |
| Time (total CPU) (μs) * | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 100 |
"""
    return text


def report(script, *arguments):
    output = io.StringIO()
    with patch.object(sys, "argv", [script, *map(str, arguments)]), contextlib.redirect_stdout(output):
        runpy.run_path(str(BENCHMARKS / script), run_name="__main__")
    return output.getvalue()


class BenchmarkReportTests(unittest.TestCase):
    def test_medians_keep_words_and_ticks_separate_without_a_saved_tick_base(self):
        current = results("Current_run", [
            (sample, count, unit, values)
            for count in LENGTHS
            for sample, unit, values in (
                ("word", "M", (1, 2, 8, 9, 10, 11, 12)),
                ("tick", "K", (100, 250, 500, 750, 900, 990, 1000)),
            )
        ])
        saved = results("base", [("word", count, "M", (1, 2, 10, 11, 12, 13, 14)) for count in LENGTHS])
        saved += results("base", [("unrelated", 6000, "G", (99,) * 7)])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "compare.md"
            path.write_text(current + saved)
            table = report("medians.py", path)
        for count in LENGTHS:
            self.assertIn(f"| word | {count:,} | 10.0 M | 8.0 M | -20% |", table)
            self.assertIn(f"| tick | {count:,} | — | 0.5 M | — |", table)
        self.assertEqual(len(table.splitlines()), 10)

    def test_percentiles_compare_both_samples_across_runs_without_saved_tick_results(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for ref, offsets in (("before", (0, 1, 2)), ("after", (4, 5, 6))):
                for run, offset in enumerate(offsets):
                    samples = [
                        (sample, count, "M", tuple(value + offset for value in (1, 2, 3, 4, 5, 6, 7)))
                        for sample in ("word", "tick") for count in LENGTHS
                    ]
                    (root / f"{ref}-{run}.md").write_text(results("Current_run", samples))
            table = report("percentiles.py", root, "before", "after")
        for sample in ("word", "tick"):
            for count in LENGTHS:
                for percentile, low, high in (("p50", "3.0–5.0 M", "7.0–9.0 M"),
                                              ("p90", "5.0–7.0 M", "9.0–11.0 M"),
                                              ("p99", "6.0–8.0 M", "10.0–12.0 M")):
                    self.assertIn(f"| {sample} | {count:,} | {percentile} | {low} | {high} | no |", table)

    def test_archived_comparison_format_still_reports_each_samples_current_values(self):
        text = ""
        for sample, unit, base, current in (("word", "M", 10, 8), ("tick", "K", 1000, 500)):
            text += f"""### One {sample} with 20 lines in the panel metrics
| Instructions ({unit}) | p0 | p25 | p50 | p75 | p90 | p99 | p100 |
|---|---|---|---|---|---|---|---|
| base | 1 | 2 | {base} | 4 | 5 | 6 | 7 |
| Current_run | 1 | 2 | {current} | 4 | 5 | 6 | 7 |
| Wall clock (us) | p0 | p25 | p50 | p75 | p90 | p99 | p100 |
| Current_run | 99 | 99 | 99 | 99 | 99 | 99 | 99 |
"""
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for ref in ("before", "after"):
                (root / f"{ref}-1.md").write_text(text)
            medians = report("medians.py", root / "after-1.md")
            percentiles = report("percentiles.py", root, "before", "after")
        self.assertIn("| word | 20 | 10.0 M | 8.0 M | -20% |", medians)
        self.assertIn("| tick | 20 | 1.0 M | 0.5 M | -50% |", medians)
        self.assertIn("| word | 20 | p50 | 8.0–8.0 M | 8.0–8.0 M | yes |", percentiles)
        self.assertIn("| tick | 20 | p50 | 0.5–0.5 M | 0.5–0.5 M | yes |", percentiles)
