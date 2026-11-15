"""The review's verdicts against a stand-in gh serving runs and artifacts from a directory."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_nightly_report import IDENTITY, LOG

SCRIPT = Path(__file__).resolve().parents[1] / "nightly-review.py"
GH = f"""#!{sys.executable}
import json, os, shutil, sys
from pathlib import Path
store = Path(os.environ["STORE"])
if sys.argv[1:3] == ["run", "list"]:
    print((store / "runs.json").read_text())
elif sys.argv[1:3] == ["run", "download"]:
    source = store / sys.argv[3]
    if not source.exists():
        sys.exit(1)
    shutil.copytree(source, sys.argv[sys.argv.index("--dir") + 1])
"""


class NightlyReviewTests(unittest.TestCase):
    def review(self, nights, now="2026-11-15T06:00:00Z"):
        """nights: (id, day in November, conclusion, cpu or None for no artifact)."""
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        store, binary = root / "store", root / "bin"
        store.mkdir(); binary.mkdir()
        (binary / "gh").write_text(GH); (binary / "gh").chmod(0o755)
        listed = []
        for id_, day, conclusion, cpu in nights:
            started = f"2026-11-{day:02d}T01:45:00Z"
            listed.append({"databaseId": id_, "status": "completed", "conclusion": conclusion, "createdAt": started,
                           "headSha": f"{id_:040d}", "url": f"https://example.invalid/{id_}"})
            if cpu is not None:
                (store / str(id_)).mkdir()
                (store / str(id_) / "identity.json").write_text(json.dumps({**IDENTITY, "commit": str(id_), "started": started}))
                (store / str(id_) / "endurance.log").write_text(LOG.replace("cpu 2166.0 s", f"cpu {cpu} s"))
        (store / "runs.json").write_text(json.dumps(listed))
        env = dict(os.environ, STORE=str(store), PATH=f"{binary}:{os.environ['PATH']}")
        result = subprocess.run([sys.executable, "-I", str(SCRIPT), "--work", str(root / "work"),
                                 "--since", "2026-11-14T06:00:00Z", "--now", now],
                                capture_output=True, text=True, env=env, timeout=60)
        return result.returncode, result.stdout

    def test_verdicts(self):
        base = [(n, 9 + n, "success", 1700) for n in range(1, 6)]  # 10th to 14th
        cases = {
            "clean": (base + [(9, 15, "success", 1700)], 0, "| valid | 0 |"),
            "warns": (base + [(9, 15, "success", 1900)], 2, "cpu_seconds increased"),
            "failed run": (base + [(9, 15, "failure", 1700)], 3, "| failure |"),
            "no artifact": (base + [(9, 15, "success", None)], 3, "| unavailable | INVALID |"),
            "nothing new": (base, 4, "No new measurement"),
            "blocked": ([(n, n, "success", 1700) for n in range(1, 6)], 5, "BLOCKED"),
        }
        for name, (nights, code, text) in cases.items():
            with self.subTest(name=name):
                exit_code, output = self.review(nights)
                self.assertEqual(exit_code, code, output)
                self.assertIn(text, output)


if __name__ == "__main__":
    unittest.main()
