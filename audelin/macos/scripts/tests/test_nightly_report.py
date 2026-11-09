import importlib.util
import json
import copy
import subprocess
import sys
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
    "cpu 2166.0 s, 20% of one core; footprint 480 MiB at the end, peak 490 MiB",
    "rehearsal: written: microphone 10800.0 s, call 10800.0 s of 10800.0 s fed; transcript Me 13421 words, Them 13321 words"])


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
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)

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
        log = minute(1, "0,4", 433, lag="0,2–5,6 s, mean 1,4 s over 27") + "\n" + "\n".join(LOG.splitlines()[-2:]).replace("2166.0", "2166,0")
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

    def cli(self, directory, previous=None):
        command = [sys.executable, "-I", str(SCRIPT), str(directory)]
        if previous is not None:
            command += ["--previous", str(previous)]
        result = subprocess.run(command, capture_output=True, text=True, timeout=20)
        return result, json.loads((directory / "report.json").read_text()), (directory / "report.md").read_text()

    def test_locale_grouping_and_decimals_in_all_measurements(self):
        for space in (" ", "\u00a0", "\u202f"):
            for decimal in (".", ","):
                with self.subTest(space=repr(space), decimal=decimal):
                    log = LOG.replace("2166.0", f"1{space}706.4").replace("10800.0", f"10{space}800.0")
                    log = log.replace("13421", f"13{space}421").replace("13321", f"13{space}321")
                    log = log.replace("10830", f"10{space}830").replace("10800.0 s,", f"10{space}800.0 s,")
                    log = log.replace("0.5", f"1{space}000.5").replace("mean 1.50", f"mean 1{space}000.50")
                    log = log.replace("490 MiB", f"1{space}490 MiB")
                    log = log.replace(".", decimal)
                    report = run(self.root / f"locale-{ord(space)}-{ord(decimal)}", "a", log=log)
                    self.assertTrue(report["valid"], report)
                    evidence = report["endurance"]
                    self.assertEqual(evidence["cpu_seconds"], 1706.4)
                    self.assertEqual(evidence["footprint_peak_mib"], 1490)
                    self.assertEqual(evidence["samples"]["180"]["behind_s"], 1000.5)
                    self.assertEqual(evidence["samples"]["180"]["final_lag_mean_s"], 1000.5)
                    self.assertEqual(evidence["tracks"]["call"]["written_s"], 10800)
                    self.assertEqual(evidence["speaker_words"], {"Me": 13421, "Them": 13321})

    def test_invalid_evidence_is_explicit_and_cli_fails_after_writing_reports(self):
        cases = {
            "no done": LOG.replace(LOG.splitlines()[-2], ""),
            "truncated": "\n".join(LOG.splitlines()[:40]),
            "short fed": LOG.replace("10800.0", "10740.0"),
            "short done": LOG.replace("done: 180", "done: 179"),
            "mic loss": LOG.replace("microphone 10800.0", "microphone 10799.8"),
            "call loss": LOG.replace("call 10800.0", "call 10700.0"),
            "excess": LOG.replace("call 10800.0", "call 10801.0"),
            "lost track": LOG.replace("call 10800.0 s", "call unreadable"),
            "no written": "\n".join(LOG.splitlines()[:-1]),
            "duplicate written": LOG + "\n" + LOG.splitlines()[-1],
            "duplicate done": LOG + "\n" + LOG.splitlines()[-2],
            "no transcript": LOG.replace("transcript Me 13421 words, Them 13321 words", "no transcript"),
            "empty transcript": LOG.replace("transcript Me 13421 words, Them 13321 words", "transcript empty"),
            "no Them": LOG.replace(", Them 13321 words", ""),
            "zero Me": LOG.replace("Me 13421", "Me 0"),
            "zero Them": LOG.replace("Them 13321", "Them 0"),
            "bad CPU": LOG.replace("2166.0", "1 70 6,4"),
            "NaN CPU": LOG.replace("2166.0", "NaN"),
            "bad fed": LOG.replace("10800.0 s fed", "10.800,0 s fed"),
            "bad sample": LOG.replace("at most 0.5", "at most 0..5"),
            "bad lag": LOG.replace("mean 1.50", "mean 1..50"),
            "harness failed": LOG + "\nendurance failed: 9",
        }
        for name, log in cases.items():
            with self.subTest(name=name):
                directory = self.root / name
                run(directory, "a", log=log)
                result, data, text = self.cli(directory)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertFalse(data["valid"])
                self.assertTrue(data["errors"] or data["endurance"]["reasons"])
                self.assertIn("Evidence: INVALID", text)
                self.assertIn("unavailable", text)

    def test_track_loss_values_and_printed_precision(self):
        report = run(self.root / "loss", "a", log=LOG.replace("call 10800.0", "call 10700.0"))
        track = report["endurance"]["tracks"]["call"]
        self.assertEqual(track["duration_difference_s"], -100)
        self.assertEqual(track["shortfall_s"], 100)
        self.assertAlmostEqual(track["loss_percent"], 10000 / 10800)
        unreadable = run(self.root / "unreadable", "a", log=LOG.replace("call 10800.0 s", "call unreadable"))
        self.assertEqual(unreadable["endurance"]["tracks"]["microphone"]["written_s"], 10800)
        self.assertIsNone(unreadable["endurance"]["tracks"]["call"]["shortfall_s"])
        rounded = run(self.root / "rounded", "a", log=LOG.replace("microphone 10800.0", "microphone 10799.9"))
        self.assertTrue(rounded["valid"])
        self.assertAlmostEqual(rounded["endurance"]["tracks"]["microphone"]["shortfall_s"], 0.1)

    def test_all_samples_and_descriptive_trends_are_exported(self):
        data = run(self.root / "a", "a")
        evidence = data["endurance"]
        self.assertEqual(len(evidence["samples"]), 180)
        self.assertEqual(evidence["samples"]["12"]["footprint_mib"], 312)
        self.assertEqual(evidence["samples"]["12"]["wall_s"], 720)
        self.assertEqual(evidence["trends"]["footprint_samples"], 151)
        self.assertAlmostEqual(evidence["trends"]["footprint_mib_per_hour"], 60)
        self.assertAlmostEqual(evidence["trends"]["backlog_s_per_minute"], 0)
        self.assertEqual(evidence["trends"]["backlog_max_s"], 0.1)
        log = LOG
        for n in range(1, 181):
            log = log.replace(minute(n, 0.5, 300 + n), minute(n, 0.5, 300 + n).replace("now 0.1", f"now {n}.0"))
        growing = run(self.root / "growing", "a", log=log)["endurance"]["trends"]
        self.assertAlmostEqual(growing["backlog_s_per_minute"], 1)
        self.assertEqual(growing["backlog_max_s"], 180)
        self.assertIn("Retained transcript growth is not evidence of a leak", nightly.markdown(data))

    def test_missing_measurements_are_null_and_never_invented_zeroes(self):
        log = "\n".join([minute(1, 0.5, -1, lag="no reports").replace(
            "1.00–2.00 s, mean 1.50 s over 10", "no reports")] + LOG.splitlines()[-2:])
        data = run(self.root / "a", "a", log=log, capture={"hangs": {}})
        evidence = data["endurance"]
        self.assertTrue(data["valid"])
        self.assertIsNone(evidence["samples"]["1"]["footprint_mib"])
        self.assertIsNone(evidence["samples"]["1"]["newest_lag_mean_s"])
        self.assertIsNone(evidence["samples"]["1"]["final_lag_mean_s"])
        self.assertIsNone(evidence["trends"]["footprint_mib_per_hour"])
        self.assertIsNone(evidence["trends"]["backlog_s_per_minute"])
        self.assertEqual(data["captures"]["capture-6000"],
                         {"main_thread_percent": None, "hangs": None, "longest_hang_ms": None})
        self.assertIn("unavailable", nightly.markdown(data))
        self.assertIn("per-track acoustic partial/final p50/p95", evidence["unmeasured"])
        self.assertIsNone(nightly.metrics(data)["final_lag_mean_s"])
        self.assertIsNone(nightly.metrics(data)["backlog_s"])
        self.assertIsNone(nightly.slope([(30, 3), (31, 4)]))

    def test_only_verified_correct_previous_evidence_can_be_a_baseline(self):
        new = run(self.root / "new", "b")
        old = run(self.root / "old", "a")
        for invalid in ({**old, "valid": False}, {**old, "endurance": None},
                        {**old, "endurance": {"completed": True}},
                        {**old, "errors": ["invalid"]}):
            with self.subTest(invalid=invalid):
                self.assertFalse(nightly.comparison(new, invalid)["deltas"])
                self.assertIn("invalid or unverified", nightly.markdown(new, invalid))
        invalid_current = run(self.root / "invalid", "c", log=LOG.replace("Me 13421", "Me 0"))
        self.assertFalse(nightly.comparison(invalid_current, old)["deltas"])

    def test_deltas_and_warning_threshold_are_in_the_written_reports(self):
        old_dir = self.root / "old"
        old = run(old_dir, "a", capture={"hangs": {"count": 0, "longest_ns": 0}})
        (old_dir / "report.json").write_text(json.dumps(old))
        for share, warns in ((22, False), (22.1, True)):
            with self.subTest(share=share):
                directory = self.root / str(share)
                run(directory, "b", log=LOG.replace("20%", f"{share}%"),
                    capture={"hangs": {"count": 1, "longest_ns": 300_000_000}})
                result, data, text = self.cli(directory, old_dir)
                self.assertEqual(result.returncode, 0, result.stderr)
                deltas = data["comparison"]["deltas"]
                self.assertAlmostEqual(deltas["cpu_share_percent"]["delta"], share - 20)
                self.assertEqual(deltas["footprint_peak_mib"]["delta"], 0)
                self.assertEqual(deltas["final_lag_mean_s"]["delta"], 0)
                self.assertEqual(deltas["backlog_s"]["delta"], 0)
                self.assertEqual(deltas["capture-6000.hangs"]["delta"], 1)
                self.assertIsNone(deltas["capture-6000.hangs"]["percent"])
                warnings = data["comparison"]["warnings"]
                self.assertEqual(any(w.startswith("cpu_share_percent ") for w in warnings), warns)
                self.assertIn("investigate and repeat", text)
        # Missing capture measurements stay unavailable in comparisons too.
        missing = run(self.root / "missing", "c")
        self.assertIsNone(nightly.comparison(missing, old)["deltas"]["capture-6000.hangs"]["delta"])

    def test_cli_handles_bad_current_and_previous_files_clearly(self):
        old_dir = self.root / "old"
        old = run(old_dir, "a")
        new_dir = self.root / "new"
        run(new_dir, "b")
        for content in ("{broken", "null", "[]", '{"valid": NaN}', json.dumps({**old, "valid": False}),
                        json.dumps({**old, "identity": []}), json.dumps({**old, "captures": []})):
            with self.subTest(content=content):
                (old_dir / "report.json").write_text(content)
                result, data, text = self.cli(new_dir, old_dir)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertFalse(data["comparison"]["deltas"])
                self.assertIn("Not compared", text)
                self.assertEqual((old_dir / "report.json").read_text(), content)
        for filename in ("identity.json", "capture-6000/summary.json", "endurance.log"):
            with self.subTest(filename=filename):
                directory = self.root / filename.replace("/", "-")
                run(directory, "a", capture={"hangs": {"count": 0}})
                (directory / filename).write_text("{broken")
                result, data, text = self.cli(directory)
                self.assertEqual(result.returncode, 1, result.stderr)
                self.assertIn("INVALID", text)
        directory = self.root / "nonfinite identity"
        run(directory, "a")
        (directory / "identity.json").write_text(json.dumps({**IDENTITY, "models": float("nan")}))
        result, data, text = self.cli(directory)
        self.assertEqual(result.returncode, 1)
        self.assertIn("non-finite JSON number", text)
        directory = self.root / "missing log"
        run(directory, "a")
        (directory / "endurance.log").unlink()
        result, data, text = self.cli(directory)
        self.assertEqual(result.returncode, 1)
        self.assertIn("cannot parse run evidence", text)

    def test_workload_duration_must_be_known_and_reached(self):
        for workload in ("AudelinBaseline --speech mine.wav", "AudelinBaseline --minutes", "AudelinBaseline --minutes nope",
                         "AudelinBaseline --minutes 0", "AudelinBaseline --minutes 181"):
            with self.subTest(workload=workload):
                identity = copy.deepcopy(IDENTITY)
                identity["workload"]["endurance"] = workload
                report = run(self.root / str(len(list(self.root.iterdir()))), "a", identity=identity)
                self.assertFalse(report["valid"])
        identity = copy.deepcopy(IDENTITY)
        identity["workload"]["endurance"] = "AudelinBaseline --minutes 1 --speed 1"
        log = minute(1, 0.5, 300) + "\n" + "\n".join(LOG.splitlines()[-2:]).replace(
            "done: 180 min", "done: 1 min").replace("10800.0", "60.0")
        self.assertTrue(run(self.root / "one-minute", "a", identity=identity, log=log)["valid"])


if __name__ == "__main__":
    unittest.main()
