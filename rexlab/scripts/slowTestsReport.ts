// The ranking of the weekly slow-test hunt: every test's median duration
// over several runs of the whole suite, slowest first. No baseline and no
// thresholds: the hunter picks from the top.

export type Sample = { id: string; file: string; line: number | undefined; durationMs: number };
export type RankedTest = { rank: number; id: string; location: string; medianMs: number; runsMs: number[]; skipped: boolean };
export type Report = { project: string; runs: number; generatedAt: string; tests: RankedTest[] };

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// A skip list names one test per line, as its id in the report; blank
// lines and text after `#` are ignored.
export function parseSkipList(text: string): Set<string> {
  return new Set(text.split("\n").map((line) => line.replace(/#.*/, "").trim()).filter(Boolean));
}

// `runs` holds each run's samples. A test missing from a run (it failed
// to collect, or was filtered) is ranked by the runs it is in.
export function rank(project: string, runs: Sample[][], skip: Set<string>, generatedAt: string): Report {
  const byId = new Map<string, { sample: Sample; durations: number[] }>();
  for (const run of runs) {
    for (const sample of run) {
      const entry = byId.get(sample.id) ?? { sample, durations: [] };
      entry.durations.push(sample.durationMs);
      byId.set(sample.id, entry);
    }
  }
  const tests = [...byId.values()]
    .map(({ sample, durations }) => ({
      id: sample.id,
      location: sample.line === undefined ? sample.file : `${sample.file}:${sample.line}`,
      medianMs: Math.round(median(durations) * 10) / 10,
      runsMs: durations.map((value) => Math.round(value * 10) / 10),
      skipped: skip.has(sample.id)
    }))
    .sort((a, b) => b.medianMs - a.medianMs || a.id.localeCompare(b.id))
    .map((test, index) => ({ rank: index + 1, ...test }));
  return { project, runs: runs.length, generatedAt, tests };
}

export function markdown(report: Report, limit = 50): string {
  const escape = (text: string) => text.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = report.tests.slice(0, limit).map((test) =>
    `| ${test.rank} | ${test.medianMs} | ${test.runsMs.join(" / ")} | \`${escape(test.location)}\` | ${escape(test.id)}${test.skipped ? " (skipped)" : ""} |`
  );
  return [
    `## ${report.project}: slowest tests`,
    "",
    `${report.tests.length} tests, median of ${report.runs} runs, ${report.generatedAt}. Top ${Math.min(limit, report.tests.length)}; the full ranking is in \`slow-tests-report.json\`.`,
    "",
    "| # | Median ms | Runs ms | Location | Test |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    ""
  ].join("\n");
}
