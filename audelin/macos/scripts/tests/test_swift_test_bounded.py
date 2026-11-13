import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

RUNNER = Path(__file__).resolve().parents[3] / "scripts" / "swift-test-bounded.sh"

# Stands in for coreaudiod: holds little memory until told to grow.
DAEMON = '''
import os, sys, time
cue = sys.argv[1]
while not os.path.exists(cue):
    time.sleep(0.05)
held = bytearray(int(sys.argv[2]) * 1024 * 1024)
for i in range(0, len(held), 4096):
    held[i] = 1
time.sleep(120)
'''


class SwiftTestBoundedTests(unittest.TestCase):

    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.cue = self.root / "grow"
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        swift = bin_dir / "swift"
        swift.write_text(f"#!{sys.executable}\n" + '''
import os, sys, time
assert sys.argv[1:3] == ["test", "--skip-build"]
open(os.environ["CUE"], "w").close()
if os.environ.get("STUB_CHILD_MB"):
    import subprocess
    subprocess.Popen([sys.executable, "-I", "-c",
        "import sys, time\\nheld = bytearray(int(sys.argv[1]) * 1024 * 1024)\\n"
        "for i in range(0, len(held), 4096): held[i] = 1\\ntime.sleep(120)",
        os.environ["STUB_CHILD_MB"]])
time.sleep(float(os.environ["STUB_SECONDS"]))
print("stub swift finished")
''')
        swift.chmod(0o755)
        self.env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", CUE=str(self.cue))

    def daemon(self, grow_mb):
        process = subprocess.Popen([sys.executable, "-I", "-c", DAEMON, str(self.cue), str(grow_mb)])
        self.addCleanup(process.wait)
        self.addCleanup(process.kill)
        return process

    def run_bounded(self, daemon, seconds, growth_kb):
        env = dict(self.env, BOUNDED_WATCH_PID=str(daemon.pid),
                   BOUNDED_RSS_GROWTH_KB=str(growth_kb), STUB_SECONDS=str(seconds))
        started = time.monotonic()
        result = subprocess.run(["sh", str(RUNNER), "60"], env=env, capture_output=True, text=True, timeout=90)
        return result, time.monotonic() - started

    def test_a_watched_daemon_that_grows_past_the_limit_kills_the_run(self):
        daemon = self.daemon(grow_mb=200)
        result, took = self.run_bounded(daemon, seconds=40, growth_kb=50 * 1024)
        self.assertEqual(result.returncode, 125, result.stdout + result.stderr)
        self.assertIn("coreaudiod grew from", result.stderr)
        self.assertIn("grew past its limit and the run was killed", result.stdout)
        self.assertNotIn("stub swift finished", result.stdout)
        self.assertLess(took, 20)

    def test_a_run_whose_daemon_stays_within_the_limit_reports_its_memory(self):
        daemon = self.daemon(grow_mb=20)
        result, _ = self.run_bounded(daemon, seconds=3, growth_kb=200 * 1024)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("stub swift finished", result.stdout)
        self.assertIn("coreaudiod before the run:", result.stderr)
        self.assertIn("coreaudiod after the run:", result.stderr)

    def test_a_test_child_that_grows_past_the_tree_cap_kills_the_run(self):
        env = dict(self.env, BOUNDED_WATCH_PID="999999", STUB_SECONDS="40",
                   STUB_CHILD_MB="300", BOUNDED_TREE_RSS_KB=str(100 * 1024))
        started = time.monotonic()
        result = subprocess.run(["sh", str(RUNNER), "60"], env=env, capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 125, result.stdout + result.stderr)
        self.assertIn("past the cap of 100 MB", result.stderr)
        self.assertIn("grew past its limit and the run was killed", result.stdout)
        self.assertNotIn("stub swift finished", result.stdout)
        self.assertLess(time.monotonic() - started, 20)

    def test_an_unreadable_daemon_is_reported_and_not_watched(self):
        env = dict(self.env, BOUNDED_WATCH_PID="999999", STUB_SECONDS="0")
        result = subprocess.run(["sh", str(RUNNER), "60"], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("coreaudiod memory cannot be read here", result.stderr)


if __name__ == "__main__":
    unittest.main()
