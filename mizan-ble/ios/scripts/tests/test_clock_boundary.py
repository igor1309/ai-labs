from pathlib import Path
import re
import unittest


PACKAGE = Path(__file__).resolve().parents[2]

# Only the apps (main, preview, rehearsal) import SystemClock; every module
# and test takes its time through an interface it owns, so a fake drives it.
IMPORT = re.compile(r"^\s*(@testable\s+)?import\s+SystemClock\b", re.MULTILINE)

# The only files that may read or wait on real time.
WALL_CLOCK = re.compile(
    r"\b(ContinuousClock|SuspendingClock|Task\.sleep|Thread\.sleep|usleep|asyncAfter|Date\(\)|DispatchTime\.now)"
)
WALL_CLOCK_ALLOWED = {
    Path("Sources/SystemClock/SystemClock.swift"),
    Path("Tests/SystemClockTests/SystemClockTests.swift"),
}


def swift_files(folder):
    return sorted((PACKAGE / folder).rglob("*.swift"))


class ClockBoundaryTests(unittest.TestCase):
    def test_no_package_module_depends_on_system_clock(self):
        manifest = (PACKAGE / "Package.swift").read_text()
        mentions = [line.strip() for line in manifest.splitlines() if '"SystemClock"' in line]
        self.assertEqual(
            mentions,
            [
                '.library(name: "SystemClock", targets: ["SystemClock"]),',
                '.target(name: "SystemClock"),',
                '.testTarget(name: "SystemClockTests", dependencies: ["SystemClock"]),',
            ],
        )

    def test_only_system_clock_tests_import_system_clock(self):
        importers = [
            str(path.relative_to(PACKAGE))
            for folder in ("Sources", "Tests")
            for path in swift_files(folder)
            if IMPORT.search(path.read_text())
        ]
        self.assertEqual(importers, ["Tests/SystemClockTests/SystemClockTests.swift"])

    def test_only_system_clock_reads_or_waits_on_real_time(self):
        offenders = [
            f"{path.relative_to(PACKAGE)}:{number}"
            for folder in ("Sources", "Tests")
            for path in swift_files(folder)
            if path.relative_to(PACKAGE) not in WALL_CLOCK_ALLOWED
            for number, line in enumerate(path.read_text().splitlines(), 1)
            if WALL_CLOCK.search(line)
        ]
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
