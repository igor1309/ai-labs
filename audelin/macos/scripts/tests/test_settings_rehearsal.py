import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "rehearsal.sh"
STATES = ("release", "debug", "confirm-move", "moving", "move-failed", "during-recording",
          "summaries-off", "summaries-on", "summaries-local", "summaries-invalid",
          "summaries-unavailable", "summaries-validating", "summaries-saving",
          "summaries-save-failed", "summaries-saved", "summaries-loading", "summaries-load-failed")


class SettingsRehearsalTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        scripts = self.root / "macos" / "scripts"
        scripts.mkdir(parents=True)
        self.script = scripts / "rehearsal.sh"
        shutil.copyfile(SCRIPT, self.script)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.out = self.root / "exports with spaces"
        self.variables = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                              STUB_EXIT="0", BUILD_EXIT="0", OMIT="", TEST_STATES=",".join(STATES),
                              CALLS=str(self.root / "calls"))
        # Only declared shell utilities are available; GNU timeout cannot leak
        # in from the developer machine.
        self.variables["PATH"] = str(self.bin)
        for name in ("mkdir", "mktemp", "rm", "mv", "dirname"):
            (self.bin / name).symlink_to(shutil.which(name))
        runner = self.root / "scripts" / "swift-test-bounded.sh"
        runner.parent.mkdir()
        runner.write_text('#!/bin/bash\n[ "$1" = 120 ] || exit 98\nshift\nexec swift test --skip-build "$@"\n')
        runner.chmod(0o755)
        swift = self.bin / "swift"
        swift.write_text(f"#!{sys.executable}\n" + '''
import os
from pathlib import Path
import sys
assert "--disable-sandbox" in sys.argv
for option, value in (("--cache-path", "/tmp/codex-swift/cache"),
                      ("--config-path", "/tmp/codex-swift/config"),
                      ("--security-path", "/tmp/codex-swift/security")):
    assert sys.argv[sys.argv.index(option) + 1] == value
assert os.environ["CLANG_MODULE_CACHE_PATH"] == "/tmp/codex-swift/clang"
with open(os.environ["CALLS"], "a") as calls:
    calls.write(sys.argv[1] + "\\n")
if sys.argv[1] == "build":
    assert "--build-tests" in sys.argv
    print("stub build finished")
    sys.exit(int(os.environ["BUILD_EXIT"]))
assert sys.argv[1:3] == ["test", "--skip-build"]
assert sys.argv[sys.argv.index("--filter") + 1] == "SettingsViewRenderTests/everyPreviewFillsTheWindow"
out = Path(os.environ["AUDELIN_SNAPSHOTS"])
for state in os.environ["TEST_STATES"].split(","):
    for appearance in ("light", "dark"):
        name = f"settings-{state}-{appearance}.png"
        if name != os.environ["OMIT"]:
            (out / name).write_bytes(b"snapshot")
print("stub swift finished")
sys.exit(int(os.environ["STUB_EXIT"]))
''')
        swift.chmod(0o755)

    def run_script(self, *args):
        return subprocess.run(["/bin/bash", str(self.script), *args], cwd=self.root,
                              env=self.variables, capture_output=True, text=True, timeout=20)

    def test_exports_every_state_and_appearance_repeatably(self):
        for _ in range(2):
            result = self.run_script("all", "--out", str(self.out))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Exported 34 Settings previews", result.stdout)
            self.assertEqual({p.name for p in self.out.glob("*.png")},
                             {f"settings-{s}-{a}.png" for s in STATES for a in ("light", "dark")})
            self.assertEqual((self.out / "rehearsal.log").read_text(), "stub build finished\nstub swift finished\n")
        self.assertEqual((self.root / "calls").read_text(), "build\ntest\nbuild\ntest\n")

    def test_propagates_swift_failure(self):
        self.variables["STUB_EXIT"] = "9"
        result = self.run_script("all", "--out", str(self.out))
        self.assertEqual(result.returncode, 9)
        self.assertIn("exit 9", result.stderr)

    def test_propagates_build_failure_without_running_tests(self):
        self.variables["BUILD_EXIT"] = "7"
        result = self.run_script("all", "--out", str(self.out))
        self.assertEqual(result.returncode, 7)
        self.assertIn("exit 7", result.stderr)
        self.assertEqual((self.root / "calls").read_text(), "build\n")
        self.assertEqual((self.out / "rehearsal.log").read_text(), "stub build finished\n")

    def test_rejects_missing_export_even_with_an_old_file(self):
        self.out.mkdir()
        omitted = "settings-summaries-local-dark.png"
        (self.out / omitted).write_bytes(b"old image")
        self.variables["OMIT"] = omitted
        result = self.run_script("all", "--out", str(self.out))
        self.assertEqual(result.returncode, 1)
        self.assertIn("Missing Settings export", result.stderr)
        self.assertEqual((self.out / omitted).read_bytes(), b"old image")

    def test_rejects_unsupported_arguments(self):
        for arguments in ((), ("all",), ("recording", "--out", "x"), ("all", "--out", "")):
            with self.subTest(arguments=arguments):
                result = self.run_script(*arguments)
                self.assertEqual(result.returncode, 64)
                self.assertIn("usage:", result.stderr)
