"""Contract tests: nightly shell history updates with stubbed measurement tools."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from test_nightly_report import LOG

SCRIPTS = Path(__file__).resolve().parents[1]


class NightlyHistoryTests(unittest.TestCase):
    def test_only_successful_validated_reports_advance_latest(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            macos = root / "macos"
            scripts = macos / "scripts"
            scripts.mkdir(parents=True)
            for name in ("nightly.sh", "nightly-report.py"):
                shutil.copyfile(SCRIPTS / name, scripts / name)
            profile = macos / "Benchmarks/Profile"
            profile.mkdir(parents=True)
            (profile / "build.sh").write_text('#!/bin/bash\nexit 0\n')
            (profile / "build.sh").chmod(0o755)
            speech = macos / "Benchmarks/speech-audio.sh"
            speech.write_text('#!/bin/bash\nmkdir -p "$1"\nprintf mine > "$1/mine.wav"\nprintf theirs > "$1/theirs.wav"\n')
            speech.chmod(0o755)
            summarizer = scripts / "summarize-trace.py"
            summarizer.write_text('import json, sys\nfrom pathlib import Path\n'
                                  'Path(sys.argv[sys.argv.index("--json") + 1]).write_text(json.dumps('
                                  '{"sampled_cpu_ns": 100, "main_thread_ns": 25, '
                                  '"hangs": {"count": 0, "longest_ns": 0}}))\n')
            models = root / "Library/Application Support/FluidAudio/Models"
            models.mkdir(parents=True)
            (models / "model").write_text("model")
            binary = root / "bin"
            binary.mkdir()
            app = binary / "AudelinBaseline"
            app.write_text(f"#!{sys.executable}\n" +
                           'import os, sys\nfrom pathlib import Path\n'
                           'Path(sys.argv[sys.argv.index("--report") + 1]).write_text(Path(os.environ["STUB_LOG"]).read_text())\n'
                           'sys.exit(int(os.environ["STUB_STATUS"]))\n')
            app.chmod(0o755)
            shell_env = root / "bash-env"
            shell_env.write_text('''
swift() { if [[ "$*" == *--show-bin-path* ]]; then printf '%s\\n' "$STUB_BIN"; fi; }
sysctl() { case "$2" in hw.memsize) echo 1073741824;; *) echo stub;; esac; }
stat() { echo 'model 5'; }
sw_vers() { echo stub; }
xcodebuild() { echo stub; }
git() { echo stub-commit; }
xcrun() { if [[ "$2" == record && "$CAPTURE_FAIL" == 1 ]]; then return 1; fi; }
''')
            log = root / "input.log"
            env = dict(os.environ, HOME=str(root), BASH_ENV=str(shell_env), STUB_BIN=str(binary),
                       STUB_LOG=str(log), STUB_STATUS="0", CAPTURE_FAIL="0")
            # No real Swift, model, audio or profiler operation is reachable.
            history = root / "history"
            previous = None
            previous_report = None
            cases = [("first-valid", LOG, "0", "0", True),
                     ("zero-exit-lost-track", LOG.replace("call 10800.0 s", "call unreadable"), "0", "0", False),
                     ("zero-exit-short", LOG.replace("10800.0", "60.0"), "0", "0", False),
                     ("nonzero-harness", LOG, "9", "0", False),
                     ("capture-failed", LOG, "0", "1", False),
                     ("warning-only", LOG.replace("20%", "30%"), "0", "0", True)]
            for name, content, status, capture_fail, succeeds in cases:
                with self.subTest(name=name):
                    log.write_text(content)
                    env.update(STUB_STATUS=status, CAPTURE_FAIL=capture_fail)
                    out = root / name
                    result = subprocess.run(["/bin/bash", str(scripts / "nightly.sh"), "--out", str(out),
                                             "--history", str(history)], env=env, text=True,
                                            capture_output=True, timeout=20)
                    self.assertEqual(result.returncode == 0, succeeds, result.stderr)
                    report = json.loads((out / "report.json").read_text())
                    if succeeds:
                        self.assertTrue(report["valid"])
                        if name == "warning-only":
                            self.assertTrue(report["comparison"]["warnings"])
                        previous = out
                        previous_report = (out / "report.json").read_text()
                    self.assertEqual((history / "latest").resolve(), previous)
                    self.assertEqual((history / "latest/report.json").read_text(), previous_report)
