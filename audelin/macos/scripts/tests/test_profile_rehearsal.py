import json
import os
import select
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).with_name("fixtures")


class ProfileScriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.macos = self.root / "macos"
        scripts = self.macos / "scripts"
        scripts.mkdir(parents=True)
        for name in ("profile-rehearsal.sh", "summarize-trace.py"):
            shutil.copyfile(SCRIPTS / name, scripts / name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        (self.root / "tmp").mkdir()
        self.calls = self.root / "calls.jsonl"
        self.out = self.root / "results with spaces"
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        CALLS=str(self.calls), STUB_BIN=str(self.bin), FIXTURES=str(FIXTURES),
                        FAIL_STEP="", FAIL_APP="0", APP_WAIT="0", MALFORMED="0",
                        APP_PID=str(self.root / "app.pid"), CAPTURE_LENGTH="30",
                        TMPDIR=str(self.root / "tmp"), APP_EARLY_EXIT="0", BLOCK_OFFSET="0",
                        BLOCK_RECORD="0", APP_STARTED=str(self.root / "app-started"),
                        SLEEP_PID=str(self.root / "sleep.pid"), RECORDER_PID=str(self.root / "recorder.pid"),
                        MEDIA_PATH=str(self.root / "media-path"))
        self.tool("swift", '''
record("swift", sys.argv[1:])
if os.environ["FAIL_STEP"] == "build": sys.exit(9)
if "--show-bin-path" in sys.argv: print(os.environ["STUB_BIN"])
''')
        self.tool("AudelinRehearsal", '''
record("app", sys.argv[1:])
Path(os.environ["APP_PID"]).write_text(str(os.getpid()))
media = Path(sys.argv[sys.argv.index("--recordings-dir") + 1])
(media / "track.caf").write_bytes(b"recorded audio")
Path(os.environ["MEDIA_PATH"]).write_text(str(media))
import signal
def stopped(signum, frame):
    assert (media / "track.caf").exists(), "media removed before child stopped"
    Path(os.environ["APP_PID"] + ".stopped").write_text("stopped")
    sys.exit(128 + signum)
signal.signal(signal.SIGTERM, stopped)
report = Path(sys.argv[sys.argv.index("--report") + 1])
report.write_text("rehearsal: done\\n")
if "APP_READY" in os.environ: os.write(int(os.environ["APP_READY"]), b"ready")
if os.environ["CAPTURE_MODE"] == "1":
    with open(os.environ["APP_STARTED"], "w") as started: started.write(str(os.getpid()))
if os.environ["APP_WAIT"] == "1":
    with open(os.environ["APP_GATE"], "rb") as gate: gate.read()
sys.exit(int(os.environ["FAIL_APP"]))
''')
        self.tool("sleep", '''
record("sleep", sys.argv[1:])
Path(os.environ["SLEEP_PID"]).write_text(str(os.getpid()))
import signal, select
def stopped(signum, frame):
    Path(os.environ["SLEEP_PID"] + ".stopped").write_text("stopped")
    sys.exit(128 + signum)
signal.signal(signal.SIGTERM, stopped)
with open(os.environ["APP_STARTED"]) as started: app = int(started.read())
if os.environ["BLOCK_OFFSET"] == "1":
    os.write(int(os.environ["OFFSET_READY"]), b"ready")
    with open(os.environ["OFFSET_GATE"], "rb") as gate: gate.read()
if os.environ["APP_EARLY_EXIT"] == "1":
    # The kernel reports exit before the offset can complete.
    with select.kqueue() as events:
        events.control([select.kevent(app, filter=select.KQ_FILTER_PROC,
                                     flags=select.KQ_EV_ADD, fflags=select.KQ_NOTE_EXIT)], 0)
        with open(os.environ["APP_GATE"], "wb") as gate: gate.write(b"exit")
        assert events.control(None, 1, 20), "rehearsal did not exit"
record("offset-complete", sys.argv[1:])
''')
        self.tool("xcrun", '''
record("xcrun", sys.argv[1:])
step = sys.argv[2]
if step == "record":
    Path(os.environ["RECORDER_PID"]).write_text(str(os.getpid()))
    import signal
    def stopped(signum, frame):
        Path(os.environ["RECORDER_PID"] + ".stopped").write_text("stopped")
        sys.exit(128 + signum)
    signal.signal(signal.SIGTERM, stopped)
    os.kill(int(sys.argv[sys.argv.index("--attach") + 1]), 0)
    import re
    assert re.fullmatch(r"[0-9]+[smh]", sys.argv[sys.argv.index("--time-limit") + 1])
    trace = Path(sys.argv[sys.argv.index("--output") + 1])
    trace.mkdir()
    (trace / "window").write_text(sys.argv[sys.argv.index("--time-limit") + 1])
    if os.environ["FAIL_STEP"] == "record": sys.exit(9)
    if os.environ["BLOCK_RECORD"] == "1":
        os.write(int(os.environ["RECORDER_READY"]), b"ready")
        with open(os.environ["RECORDER_GATE"], "rb") as gate: gate.read()
    with open(os.environ["APP_GATE"], "wb") as gate: gate.write(b"done")
elif step == "export":
    trace = Path(sys.argv[sys.argv.index("--input") + 1])
    assert (trace / "window").read_text() == os.environ["CAPTURE_LENGTH"] + "s"
    query = sys.argv[sys.argv.index("--xpath") + 1]
    schema = query.split('@schema="')[1].split('"')[0]
    if os.environ["FAIL_STEP"] == schema:
        print("<partial>")
        sys.exit(9)
    file = {"time-profile": "profile-old.xml", "potential-hangs": "hangs-old.xml",
            "region-of-interest": "signposts-old.xml"}[schema]
    print("<broken>" if os.environ["MALFORMED"] == "1" else (Path(os.environ["FIXTURES"]) / file).read_text())
    if os.environ["FAIL_STEP"] == "signal":
        import signal
        sys.stdout.flush()
        os.kill(os.getppid(), signal.SIGTERM)
else: sys.exit(8)
''')
        for key, name in [("APP_GATE", "app-gate"), ("OFFSET_GATE", "offset-gate"),
                          ("RECORDER_GATE", "recorder-gate"), ("APP_STARTED", "app-started")]:
            gate = self.root / name
            os.mkfifo(gate)
            self.env[key] = str(gate)
        bash_env = self.root / "bash-env"
        bash_env.write_text('''kill() {
  if [[ ${1-} == -0 ]]; then
    printf '["alive", ["%s"]]\\n' "$2" >> "$CALLS"
  fi
  builtin kill "$@"
}
''')
        self.env["BASH_ENV"] = str(bash_env)

    def tool(self, name, body):
        target = self.bin / name
        target.write_text('''#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
def record(tool, args):
    with open(os.environ["CALLS"], "a") as log:
        log.write(json.dumps([tool, args]) + "\\n")
''' + body)
        target.chmod(0o755)

    def run_script(self, *args, capture=True, terminate_at=None):
        self.env["CAPTURE_MODE"] = "1" if capture else "0"
        if capture:
            self.env["APP_WAIT"] = "1"
        for path in self.root.glob("*.pid*"):
            path.unlink()
        command = ["bash", str(self.macos / "scripts/profile-rehearsal.sh"),
                   *args, "--out", str(self.out)]
        ready_read, ready_write = os.pipe()
        self.addCleanup(os.close, ready_read)
        self.addCleanup(os.close, ready_write)
        if terminate_at:
            self.env.update(APP_WAIT="1")
            self.env[{"app": "APP_READY", "offset": "OFFSET_READY", "record": "RECORDER_READY"}[terminate_at]] = str(ready_write)
            if terminate_at == "offset": self.env["BLOCK_OFFSET"] = "1"
            if terminate_at == "record": self.env["BLOCK_RECORD"] = "1"
        completed = False
        with subprocess.Popen(command, env=self.env, text=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, start_new_session=True,
                              pass_fds=(ready_write,) if terminate_at else ()) as process:
            try:
                if terminate_at:
                    self.assertTrue(select.select([ready_read], [], [], 20)[0], f"{terminate_at} never started")
                    self.assertEqual(os.read(ready_read, 5), b"ready")
                    media = Path((self.root / "media-path").read_text())
                    self.assertEqual((media / "track.caf").read_bytes(), b"recorded audio")
                    process.send_signal(signal.SIGTERM)
                stdout, stderr = process.communicate(timeout=20)
                completed = True
                return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            finally:
                pids = [int(path.read_text()) for path in self.root.glob("*.pid")]
                self.addCleanup(self.stop_groups, pids)
                if not completed:
                    self.stop_groups(pids)
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=20)

    @staticmethod
    def stop_groups(pids):
        # Job control gives each stub a group of its own.
        for pid in pids:
            try:
                os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def recorded(self):
        return [json.loads(line) for line in self.calls.read_text().splitlines()]

    def assert_no_xml(self):
        self.assertEqual(list(self.out.glob("*.xml")), [])

    def test_endurance_runs_app_and_writes_only_its_report(self):
        result = self.run_script("endurance", "--minutes", "180", "--speed", "1", capture=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([name for name, _ in self.recorded()], ["swift", "swift", "app"])
        media = (self.root / "media-path").read_text()
        self.assertEqual(self.recorded()[-1][1], ["--minutes", "180", "--speed", "1", "--recordings-dir", media,
                                                "--report", str(self.out / "rehearsal.log")])
        self.assertFalse(Path(media).exists())
        self.assertEqual([p.name for p in self.out.iterdir()], ["rehearsal.log"])
        self.assertEqual((self.out / "rehearsal.log").read_text(), "rehearsal: done\n")

    def test_endurance_termination_stops_and_reaps_its_blocked_child(self):
        result = self.run_script("endurance", capture=False, terminate_at="app")
        self.assertEqual(result.returncode, 143, result.stderr)
        self.assertEqual((self.root / "app.pid.stopped").read_text(), "stopped")
        with self.assertRaises(ProcessLookupError):
            os.kill(int((self.root / "app.pid").read_text()), 0)
        self.assertFalse(Path((self.root / "media-path").read_text()).exists())

    def test_capture_records_and_exports_only_the_bounded_trace(self):
        for length in (1, 20, 37):
            with self.subTest(length=length):
                self.out = self.root / f"capture {length}"
                self.calls.unlink(missing_ok=True)
                self.env["CAPTURE_LENGTH"] = str(length)
                workload = ["--minutes", "3", "--speed", "1", "--monologue-every", "45", "--monologue-length", "17", "--keep"]
                result = self.run_script("capture", "--capture-after", "60", "--capture-for", str(length), *workload)
                self.assertEqual(result.returncode, 0, result.stderr)
                calls = self.recorded()
                self.assertEqual([args for name, args in calls if name == "swift"], [
                    ["build", "--package-path", "App", "-c", "release", "--product", "AudelinRehearsal"],
                    ["build", "--package-path", "App", "-c", "release", "--show-bin-path"]])
                self.assertIn(["sleep", ["60"]], calls)
                self.assertEqual([args for name, args in calls if name == "app"], [
                    workload + ["--recordings-dir", (self.root / "media-path").read_text(),
                                "--report", str(self.out / "rehearsal.log")]])
                self.assertTrue((Path((self.root / "media-path").read_text()) / "track.caf").exists())
                instruments = [args for name, args in calls if name == "xcrun"]
                trace = str(self.out / "time.trace")
                app_pid = (self.root / "app.pid").read_text()
                self.assertEqual(instruments[0], [
                    "xctrace", "record", "--template", "Time Profiler", "--instrument", "Points of Interest",
                    "--output", trace, "--no-prompt", "--attach", app_pid, "--time-limit", f"{length}s"])
                self.assertEqual(instruments[1:], [
                    ["xctrace", "export", "--input", trace, "--xpath",
                     f'/trace-toc/run[@number="1"]/data/table[@schema="{schema}"]']
                    for schema in ("time-profile", "potential-hangs", "region-of-interest")])
                summary = (self.out / "summary.txt").read_text()
                self.assertIn(f"capture after 60s for {length}s", summary)
                self.assertIn("PanelUpdate: count 2, total 4.0 ms, longest 3.0 ms", summary)
                self.assertNotIn("summary-data:", summary)
                data = json.loads((self.out / "summary.json").read_text())
                self.assertEqual(data["intervals"]["PanelUpdate"],
                                 {"count": 2, "total_ns": 4_000_000, "longest_ns": 3_000_000})
                self.assert_no_xml()

    def assert_reaped(self, *names):
        for name in names:
            self.assertEqual((self.root / f"{name}.pid.stopped").read_text(), "stopped")
            with self.assertRaises(ProcessLookupError):
                os.kill(int((self.root / f"{name}.pid").read_text()), 0)

    def test_offset_completion_precedes_liveness_check_and_attachment(self):
        for offset in ("0", "0.5", "60"):
            with self.subTest(offset=offset):
                self.out = self.root / f"offset {offset}"
                self.calls.unlink(missing_ok=True)
                result = self.run_script("--capture-after", offset, "--capture-for", "30")
                self.assertEqual(result.returncode, 0, result.stderr)
                calls = self.recorded()
                completed = calls.index(["offset-complete", [offset]])
                app = (self.root / "app.pid").read_text()
                checked = calls.index(["alive", [app]])
                attached = next(i for i, (name, args) in enumerate(calls)
                                if name == "xcrun" and args[1] == "record")
                self.assertLess(completed, checked)
                self.assertLess(checked, attached)
                self.assertEqual(calls[attached][1][calls[attached][1].index("--attach") + 1], app)
                self.assertFalse(Path((self.root / "media-path").read_text()).exists())

    def test_rehearsal_exit_before_offset_fails_even_for_successful_child(self):
        for offset in ("0", "0.5", "60"):
            for status in ("0", "7"):
                with self.subTest(offset=offset, status=status):
                    self.out = self.root / f"early {offset} {status}"
                    self.calls.unlink(missing_ok=True)
                    self.env.update(APP_EARLY_EXIT="1", FAIL_APP=status)
                    result = self.run_script("--capture-after", offset, "--capture-for", "30")
                    self.assertNotEqual(result.returncode, 0, result.stderr)
                    self.assertFalse(any(name == "xcrun" for name, _ in self.recorded()))
                    self.assertIn("capture failed", (self.out / "summary.txt").read_text())
                    self.assertFalse(Path((self.root / "media-path").read_text()).exists())
                    with self.assertRaises(ProcessLookupError):
                        os.kill(int((self.root / "app.pid").read_text()), 0)

    def test_termination_during_blocked_offset_reaps_jobs_and_cleans_media_unless_kept(self):
        for keep in (False, True):
            with self.subTest(keep=keep):
                self.out = self.root / f"terminated {keep}"
                self.calls.unlink(missing_ok=True)
                result = self.run_script("--capture-after", "60", "--capture-for", "30",
                                         *(["--keep"] if keep else []), terminate_at="offset")
                self.assertEqual(result.returncode, 143, result.stderr)
                self.assert_reaped("app", "sleep")
                self.assertFalse(any(name == "xcrun" for name, _ in self.recorded()))
                self.assertIn("capture failed", (self.out / "summary.txt").read_text())
                media = Path((self.root / "media-path").read_text())
                self.assertEqual(media.exists(), keep)
                if keep: self.assertEqual((media / "track.caf").read_bytes(), b"recorded audio")

    def test_termination_during_recording_reaps_recorder_and_rehearsal_before_cleanup(self):
        result = self.run_script("--capture-for", "30", terminate_at="record")
        self.assertEqual(result.returncode, 143, result.stderr)
        self.assert_reaped("app", "recorder")
        self.assertFalse(Path((self.root / "media-path").read_text()).exists())
        self.assertIn("capture failed", (self.out / "summary.txt").read_text())

    def test_failures_remove_partial_xml_and_leave_failure_summary(self):
        for step in ("build", "record", "time-profile", "potential-hangs", "region-of-interest", "summary", "app", "signal"):
            with self.subTest(step=step):
                self.out = self.root / step
                self.env.update(FAIL_STEP=step, MALFORMED="1" if step == "summary" else "0",
                                FAIL_APP="7" if step == "app" else "0")
                result = self.run_script("--capture-after", "0", "--capture-for", "30")
                if step == "signal":
                    self.assertEqual(result.returncode, 143)
                else:
                    self.assertNotEqual(result.returncode, 0)
                self.assert_no_xml()
                media_path = self.root / "media-path"
                if media_path.exists(): self.assertFalse(Path(media_path.read_text()).exists())
                self.assertFalse((self.out / "summary.json").exists())
                self.assertIn("capture failed", (self.out / "summary.txt").read_text())

    def test_invalid_windows_fail_before_build_or_instruments(self):
        for args in [[], ["--capture-for", "0"], ["--capture-for", "-1"],
                     ["--capture-for", "inf"], ["--capture-for", "0.5"], ["--capture-for", "30.0"],
                     ["--capture-for", "NaN"], ["--capture-for", "1e2"], ["--capture-for", "20s"],
                     ["--capture-for", ""], ["--capture-for", "000"], ["--capture-for", "30", "--capture-after", "-1"],
                     ["endurance", "--capture-for", "30"], ["--capture-for"], ["--report", "somewhere"], ["--recordings-dir", "somewhere"]]:
            with self.subTest(args=args):
                result = self.run_script(*args, capture=False)
                self.assertEqual(result.returncode, 64, result.stderr)
                self.assertFalse(self.calls.exists())

    def test_usage_requires_positive_integer_capture_seconds(self):
        result = self.run_script("--help", capture=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("--capture-for requires a positive integer number of seconds", result.stdout)
        self.assertFalse(self.calls.exists())

    def test_existing_trace_is_never_exported(self):
        trace = self.out / "time.trace"
        trace.mkdir(parents=True)
        (trace / "long-recording").write_text("existing trace")
        result = self.run_script("--capture-for", "30", capture=False)
        self.assertEqual(result.returncode, 64)
        self.assertFalse(self.calls.exists())
        self.assertEqual((trace / "long-recording").read_text(), "existing trace")


if __name__ == "__main__":
    unittest.main()
