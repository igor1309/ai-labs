import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "nightly-report.py"
spec = importlib.util.spec_from_file_location("nightly_report", SCRIPT)
nightly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nightly)

IDENTITY = {
    "workload": {"endurance": "AudelinBaseline --minutes 180 --speed 1", "speech": "abc"},
    "build": "swift build -c release",
    "models": "m1",
    "machine": {"model": "Mac15,3", "macos": "26.1"},
    "toolchain": {"swift": "6.2", "xcode": "Xcode 26.1"},
}


def minute(n, behind, footprint, lag="0.40–1.20 s, mean 0.80 s over 12"):
    return (f"rehearsal: {n} min of audio in {n * 60}.0 s, at most {behind} s behind, now 0.1 s"
            f"; newest word trails by {lag}, final text by 1.00–2.00 s, mean 1.50 s over 10"
            f", footprint {footprint} MiB, peak {footprint + 5} MiB")


LOG = "\n".join([minute(n, 0.5, 300 + n) for n in range(1, 181)] + [
    "rehearsal: done: 180 min at 1.0x in 10830 s; real recognisers; recognisers at most 0.9 s behind; "
    "cpu 2166.0 s, 20% of one core; footprint 480 MiB at the end, peak 490 MiB"])


def run(directory, commit, identity=IDENTITY, log=LOG, capture=None):
    directory.mkdir(parents=True)
    (directory / "identity.json").write_text(json.dumps({**identity, "commit": commit, "started": "2026-11-07T01:43:00Z"}))
    (directory / "endurance.log").write_text(log)
    if capture:
        (directory / "capture-6000").mkdir()
        (directory / "capture-6000" / "summary.json").write_text(json.dumps(capture))
    return nightly.report(directory)


class NightlyReportTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())

    def test_reads_lag_and_footprint_at_the_planned_minutes(self):
        report = run(self.root / "a", "aaa")
        run_ = report["endurance"]
        self.assertTrue(run_["completed"])
        self.assertEqual(run_["minutes"], 180)
        self.assertEqual(sorted(run_["at"], key=int), ["1", "30", "90", "180"])
        self.assertEqual(run_["at"]["90"], {"behind_s": 0.5, "backlog_s": 0.1, "newest_lag_mean_s": 0.8,
                                            "final_lag_mean_s": 1.5, "footprint_mib": 390, "peak_mib": 395})
        self.assertEqual((run_["cpu_share_percent"], run_["footprint_end_mib"], run_["footprint_peak_mib"]), (20, 480, 490))

    def test_reads_numbers_printed_with_a_decimal_comma(self):
        log = minute(1, "0,4", 433, lag="0,2–5,6 s, mean 1,4 s over 27") + "\n" + LOG.splitlines()[-1].replace("2166.0", "2166,0")
        run_ = run(self.root / "a", "aaa", log=log)["endurance"]
        self.assertTrue(run_["completed"])
        self.assertEqual((run_["at"]["1"]["behind_s"], run_["at"]["1"]["newest_lag_mean_s"]), (0.4, 1.4))

    def test_an_unfinished_run_says_so(self):
        report = run(self.root / "a", "aaa", log="\n".join(minute(n, 0.5, 300) for n in range(1, 41)))
        self.assertFalse(report["endurance"]["completed"])
        self.assertIn("40 min, did not finish", nightly.markdown(report))

    def test_report_names_workload_build_models_machine_and_toolchain(self):
        text = nightly.markdown(run(self.root / "a", "aaa"))
        for field in ("workload", "build", "models", "machine", "toolchain"):
            self.assertIn(f"**{field}**", text)
        self.assertIn("Not compared: no earlier run.", text)

    def test_compares_runs_that_match_on_every_field_whatever_the_commit(self):
        old = run(self.root / "a", "aaa")
        new = run(self.root / "b", "bbb", log=LOG.replace("footprint 390 MiB", "footprint 400 MiB"))
        text = nightly.markdown(new, old)
        self.assertIn("Compared with `aaa`", text)
        self.assertIn("400 (was 390, +10)", text)

    def test_does_not_compare_runs_that_differ_on_any_field(self):
        old = run(self.root / "a", "aaa")
        for field, value in (("workload", {"endurance": "other"}), ("build", "debug"), ("models", "m2"),
                             ("machine", {"model": "Mac16,1"}), ("toolchain", {"swift": "6.3"})):
            with self.subTest(field=field):
                new = run(self.root / field, "bbb", identity={**IDENTITY, field: value})
                text = nightly.markdown(new, old)
                self.assertIn(f"Not compared with `aaa`: its {field} differ.", text)
                self.assertNotIn("(was", text)

    def test_captures_report_main_thread_share_and_hangs(self):
        summary = {"sampled_cpu_ns": 4_000_000, "main_thread_ns": 1_000_000,
                   "hangs": {"count": 2, "total_ns": 900_000_000, "longest_ns": 600_000_000}}
        old = run(self.root / "a", "aaa", capture=summary)
        new = run(self.root / "b", "bbb", capture={**summary, "hangs": {"count": 1, "longest_ns": 300_000_000}})
        self.assertEqual(new["captures"]["capture-6000"], {"main_thread_percent": 25.0, "hangs": 1, "longest_hang_ms": 300})
        self.assertIn("capture-6000: main thread 25.0 (was 25.0)% of sampled CPU, 1 (was 2) hangs, longest 300 (was 600) ms",
                      nightly.markdown(new, old))


if __name__ == "__main__":
    unittest.main()
