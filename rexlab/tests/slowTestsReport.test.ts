import { describe, expect, it } from "vitest";
import { markdown, median, parseSkipList, rank, type Sample } from "../scripts/slowTestsReport.ts";

const sample = (id: string, durationMs: number, line?: number): Sample => ({ id, file: `rexlab/tests/${id}.test.ts`, line, durationMs });

describe("the slow-test ranking", () => {
  it("takes the middle value, or the mean of the two middle ones", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 20, 30])).toBe(25);
  });

  it("ranks tests by median duration across runs, slowest first, with file and line", () => {
    const report = rank("rexlab", [[sample("a", 10, 3), sample("b", 900, 7)], [sample("a", 500, 3), sample("b", 100, 7)], [sample("a", 30, 3), sample("b", 200, 7)]], new Set(), "now");

    expect(report.tests.map(({ rank, id, location, medianMs, runsMs }) => ({ rank, id, location, medianMs, runsMs }))).toEqual([
      { rank: 1, id: "b", location: "rexlab/tests/b.test.ts:7", medianMs: 200, runsMs: [900, 100, 200] },
      { rank: 2, id: "a", location: "rexlab/tests/a.test.ts:3", medianMs: 30, runsMs: [10, 500, 30] }
    ]);
  });

  it("orders equal medians by id, so the same timings give the same report", () => {
    const report = rank("rexlab", [[sample("b", 5), sample("a", 5)]], new Set(), "now");

    expect(report.tests.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  it("marks the tests of the skip list as skipped and keeps them ranked", () => {
    const skip = parseSkipList("# reasons follow each id\n\nb  # needs the real canvas\n");
    const report = rank("rexlab", [[sample("a", 1), sample("b", 2)]], skip, "now");

    expect(report.tests.map(({ id, skipped }) => [id, skipped])).toEqual([["b", true], ["a", false]]);
    expect(markdown(report)).toContain("| b (skipped) |");
  });

  it("writes the top of the ranking as a table, escaping pipes", () => {
    const report = rank("rexlab", [[sample("x | y", 3, 1), sample("z", 1, 2)]], new Set(), "now");

    expect(markdown(report, 1).split("\n").filter((line) => line.startsWith("| 1 "))).toEqual(["| 1 | 3 | 3 | `rexlab/tests/x \\| y.test.ts:1` | x \\| y |"]);
    expect(markdown(report, 1)).not.toContain("| 2 |");
  });
});
