import json
import os
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
        self.calls = self.root / "calls.jsonl"
        self.out = self.root / "results with spaces"
        self.env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                        CALLS=str(self.calls), STUB_BIN=str(self.bin), FIXTURES=str(FIXTURES),
                        FAIL_STEP="", FAIL_APP="0", APP_WAIT="0", MALFORMED="0")
        self.tool("swift", '''
record("swift", sys.argv[1:])
if os.environ["FAIL_STEP"] == "build": sys.exit(9)
if "--show-bin-path" in sys.argv: print(os.environ["STUB_BIN"])
''')
        self.tool("AudelinRehearsal", '''
record("app", sys.argv[1:])
report = Path(sys.argv[sys.argv.index("--report") + 1])
report.write_text("rehearsal: done\\n")
if os.environ["APP_WAIT"] == "1":
    # A FIFO lets the recorder end the rehearsal without relying on timing.
    with open(os.environ["APP_GATE"], "rb") as gate: gate.read()
sys.exit(int(os.environ["FAIL_APP"]))
''')
        self.tool("sleep", '''
record("sleep", sys.argv[1:])
''')
        self.tool("xcrun", '''
record("xcrun", sys.argv[1:])
step = sys.argv[2]
if step == "record":
    trace = Path(sys.argv[sys.argv.index("--output") + 1])
    trace.mkdir()
    (trace / "window").write_text(sys.argv[sys.argv.index("--time-limit") + 1])
    if os.environ["FAIL_STEP"] == "record": sys.exit(9)
    with open(os.environ["APP_GATE"], "wb") as gate: gate.write(b"done")
elif step == "export":
    trace = Path(sys.argv[sys.argv.index("--input") + 1])
    assert (trace / "window").read_text() == "30s"
    query = sys.argv[sys.argv.index("--xpath") + 1]
    schema = query.split('@schema="')[1].split('"')[0]
    if os.environ["FAIL_STEP"] == schema:
        print("<partial>")
        sys.exit(9)
    file = {"time-profile": "profile-old.xml", "potential-hangs": "hangs-old.xml",
            "os-signpost-interval": "signposts-old.xml"}[schema]
    print("<broken>" if os.environ["MALFORMED"] == "1" else (Path(os.environ["FIXTURES"]) / file).read_text())
    if os.environ["FAIL_STEP"] == "signal":
        import signal
        sys.stdout.flush()
        os.kill(os.getppid(), signal.SIGTERM)
else: sys.exit(8)
''')
        gate = self.root / "app-gate"
        os.mkfifo(gate)
        self.env["APP_GATE"] = str(gate)

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

    def run_script(self, *args, capture=True):
        if capture:
            self.env["APP_WAIT"] = "1"
        command = ["bash", str(self.macos / "scripts/profile-rehearsal.sh"),
                   *args, "--out", str(self.out)]
        with subprocess.Popen(command, env=self.env, text=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, start_new_session=True) as process:
            try:
                stdout, stderr = process.communicate(timeout=20)
                return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
            finally:
                # Also end a blocked stub if a broken script fails to clean up its child.
                try:
                    os.killpg(process.pid, signal.SIGKILL)
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
        self.assertEqual(self.recorded()[-1][1], ["--minutes", "180", "--speed", "1", "--report", str(self.out / "rehearsal.log")])
        self.assertEqual([p.name for p in self.out.iterdir()], ["rehearsal.log"])
        self.assertEqual((self.out / "rehearsal.log").read_text(), "rehearsal: done\n")

    def test_capture_records_and_exports_only_the_bounded_trace(self):
        result = self.run_script("capture", "--capture-after", "120", "--capture-for", "30", "--minutes", "180")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.recorded()
        self.assertIn(["sleep", ["120"]], calls)
        instruments = [args for name, args in calls if name == "xcrun"]
        record = instruments[0]
        self.assertEqual(record[:4], ["xctrace", "record", "--template", "Time Profiler"])
        self.assertIn("Points of Interest", record)
        self.assertEqual(record[record.index("--time-limit") + 1], "30s")
        self.assertGreater(int(record[record.index("--attach") + 1]), 0)
        self.assertNotIn("--launch", record)
        trace = str(self.out / "time.trace")
        self.assertEqual(record[record.index("--output") + 1], trace)
        self.assertEqual(instruments[1:], [
            ["xctrace", "export", "--input", trace, "--xpath",
             f'/trace-toc/run[@number="1"]/data/table[@schema="{schema}"]']
            for schema in ("time-profile", "potential-hangs", "os-signpost-interval")])
        summary = (self.out / "summary.txt").read_text()
        self.assertIn("capture after 120s for 30s", summary)
        self.assertIn("PanelUpdate: count 2, total 4.0 ms, longest 3.0 ms", summary)
        self.assert_no_xml()

    def test_failures_remove_partial_xml_and_leave_failure_summary(self):
        for step in ("build", "record", "time-profile", "potential-hangs", "os-signpost-interval", "summary", "app", "signal"):
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
                self.assertIn("capture failed", (self.out / "summary.txt").read_text())

    def test_invalid_windows_fail_before_build_or_instruments(self):
        for args in [[], ["--capture-for", "0"], ["--capture-for", "-1"],
                     ["--capture-for", "inf"], ["--capture-for", "30", "--capture-after", "-1"],
                     ["endurance", "--capture-for", "30"], ["--capture-for"], ["--report", "somewhere"]]:
            with self.subTest(args=args):
                result = self.run_script(*args, capture=False)
                self.assertEqual(result.returncode, 64, result.stderr)
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
