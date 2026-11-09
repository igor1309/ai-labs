import importlib.util
import json
from pathlib import Path
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "slow-tests.py"
spec = importlib.util.spec_from_file_location("slow_tests", SCRIPT)
slow_tests = importlib.util.module_from_spec(spec)
spec.loader.exec_module(slow_tests)


def stream(*records):
    return [json.dumps(record) for record in records]


def test(test_id, line):
    return {"kind": "test", "payload": {"id": test_id, "kind": "function", "name": test_id,
                                        "sourceLocation": {"fileID": "ATests/T.swift", "line": line}}}


def event(kind, test_id, seconds):
    return {"kind": "event", "payload": {"kind": kind, "testID": test_id, "instant": {"absolute": seconds}}}


class SlowTestsTests(unittest.TestCase):
    def test_reads_each_test_functions_duration_and_location_from_the_event_stream(self):
        lines = stream(
            {"kind": "test", "payload": {"id": "ATests.S", "kind": "suite"}},
            test("ATests.S/slow()", 2), test("ATests.S/skipped()", 3), test("ATests.S/hung()", 4),
            event("testStarted", "ATests.S", 9.0),
            event("testStarted", "ATests.S/slow()", 10.0), event("testEnded", "ATests.S/slow()", 10.25),
            event("testSkipped", "ATests.S/skipped()", 10.3),
            event("testStarted", "ATests.S/hung()", 10.4),
            event("testEnded", "ATests.S", 11.0),
        ) + ["not json"]

        self.assertEqual(slow_tests.samples_from_events(lines, "audelin/macos/Tests"),
                         [{"id": "ATests.S/slow()", "file": "audelin/macos/Tests/ATests/T.swift", "line": 2, "durationMs": 250.0}])

    def test_ranks_by_median_slowest_first_and_ties_by_id(self):
        def run(a, b, c):
            return [{"id": "a", "file": "f", "line": 1, "durationMs": a},
                    {"id": "b", "file": "f", "line": 2, "durationMs": b},
                    {"id": "c", "file": "f", "line": None, "durationMs": c}]

        report = slow_tests.rank("audelin", [run(10, 900, 5), run(500, 100, 5), run(30, 200, 5)], set(), "now")

        self.assertEqual([(t["rank"], t["id"], t["location"], t["medianMs"]) for t in report["tests"]],
                         [(1, "b", "f:2", 200), (2, "a", "f:1", 30), (3, "c", "f", 5)])
        self.assertEqual(report["tests"][0]["runsMs"], [900, 100, 200])

    def test_marks_skip_list_tests_as_skipped_and_writes_them_in_the_table(self):
        skip = slow_tests.parse_skip_list("# why each is kept\n\nb  # loads the real model\n")
        report = slow_tests.rank("audelin", [[{"id": "a", "file": "f", "line": 1, "durationMs": 1},
                                              {"id": "b", "file": "f", "line": 2, "durationMs": 2}]], skip, "now")

        self.assertEqual([(t["id"], t["skipped"]) for t in report["tests"]], [("b", True), ("a", False)])
        self.assertIn("| 1 | 2 | 2 | `f:2` | b (skipped) |", slow_tests.markdown(report))
        self.assertNotIn("`f:1`", slow_tests.markdown(report, limit=1))


if __name__ == "__main__":
    unittest.main()
