import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "live-calls-merge.sh"


class LiveCallsMergeTests(unittest.TestCase):
    def test_builds_without_keychain_access_before_launching_driver(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            live = root / "live"
            live.mkdir()
            script = root / SCRIPT.name
            shutil.copyfile(SCRIPT, script)
            swift = root / "swift"
            swift.write_text("""#!/bin/sh
case "$*" in
    *--show-bin-path) printf '%s\\n' "$TEST_BIN_PATH" ;;
    *'--disable-keychain'*'--product CallsRehearsal') ;;
    *) echo "Keychain access requires a logged-in user" >&2; exit 1 ;;
esac
""")
            swift.chmod(0o755)
            driver = live / "run-driver.sh"
            driver.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
            driver.chmod(0o755)
            bin_path = root / "build with spaces"
            result = subprocess.run(
                ["/bin/sh", str(script)],
                env=dict(os.environ, PATH=f"{root}{os.pathsep}{os.environ['PATH']}",
                         TEST_BIN_PATH=str(bin_path)),
                capture_output=True, text=True, timeout=10,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.splitlines(), [
                "--support", str(live / "calls-driver.swift"),
                str(live / "calls-merge.swift"), str(bin_path / "CallsRehearsal"),
            ])
