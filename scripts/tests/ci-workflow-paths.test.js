import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import test from "node:test";

const repoRoot = new URL("../../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/ci.yml", repoRoot), "utf8");

test("ciPathFilters_shouldRunAgonaraCore_onPackageLockChanges", () => {
  const agonaraFilter = filterSection("agonara", "agonara-ci");

  assert.ok(agonaraFilter.includes('"agonara/package-lock.json"'));
});

test("ciPathFilters_shouldNotTreatDashboardScriptAsSharedInfrastructure", () => {
  const sharedFilter = filterSection("shared", "nomos");

  assert.doesNotMatch(sharedFilter, /"scripts\/\*\*"/);
});

test("ciPathFilters_shouldRunAgisterCore_onAgisterProcessChangeOnly", () => {
  const changedFiles = [".agister/processes/tests_review.yaml"];

  assert.equal(matchingFilters(changedFiles).has("agister"), true);
  assert.equal(jobRuns("agister-core", changedFiles), true);
});

test("ciPathFilters_shouldRunAgisterCore_onHomeSettingsChangeOnly", () => {
  const changedFiles = ["agister/home/prompts/code-review-tests.md"];

  assert.equal(matchingFilters(changedFiles).has("agister"), true);
  assert.equal(jobRuns("agister-core", changedFiles), true);
});

test("ciPathFilters_shouldNotRunAgisterCore_onUnrelatedPromptChange", () => {
  const changedFiles = ["prompts/other.md"];

  assert.equal(matchingFilters(changedFiles).has("agister"), false);
  assert.equal(jobRuns("agister-core", changedFiles), false);
});

test("ciPathFilters_shouldRunAgisterCore_onAgisterLayerChangeOnly", () => {
  const changedFiles = ["agister/.agister/verifies/repo.yaml"];

  assert.equal(matchingFilters(changedFiles).has("agister"), true);
  assert.equal(jobRuns("agister-core", changedFiles), true);
});

test("ciPathFilters_shouldRunWarderCore_onWarderLayerChangeOnly", () => {
  const changedFiles = ["warder/.agister/verifies/repo.yaml"];

  assert.equal(matchingFilters(changedFiles).has("warder"), true);
  assert.equal(jobRuns("warder-core", changedFiles), true);
});

test("ciPathFilters_shouldRunWarderCore_onWarderMainChangeOnly", () => {
  const changedFiles = ["warder/cmd/warder/main.go"];

  assert.equal(matchingFilters(changedFiles).has("warder"), true);
  assert.equal(jobRuns("warder-core", changedFiles), true);
});

test("ciJobs_shouldSelectAgisterCore_fromAgisterFilterOutputAlone", () => {
  assert.equal(jobRunsForFilters("agister-core", new Set(["agister"])), true);
  assert.equal(jobRunsForFilters("agister-core", new Set()), false);
});

test("ciRepoScripts_shouldRunEveryScriptsTest_onEveryChange", () => {
  const job = workflow.match(/\n  repo-scripts:\n((?:    .*\n|\n)+?)(?=\n  [\w-]+:\n)/);
  assert.ok(job, "missing repo-scripts job");
  assert.doesNotMatch(job[1], /^    (if|needs):/m);
  const globs = job[1].match(/node --test (.+)$/m)[1].split(" ");

  const tests = readdirSync(new URL("./", import.meta.url)).filter((name) => name.endsWith(".test.js"));
  assert.ok(tests.length > 0);
  for (const name of tests) {
    const file = `scripts/tests/${name}`;
    assert.ok(globs.some((glob) => matchesGlob(file, glob)), `${file} is run by no CI job`);
  }
});

test("ciReport_shouldBeNamedReport_onlyForPullRequest", () => {
  assert.equal(reportCheckName("pull_request"), "report");
  assert.notEqual(reportCheckName("push"), "report");
  assert.notEqual(reportCheckName("workflow_dispatch"), "report");
});

// Evaluates the `report` job's `name:`, the check name the required
// status check matches, for a run triggered by eventName.
function reportCheckName(eventName) {
  const job = workflow.match(/\n  report:\n((?:    .*\n)+)/);
  assert.ok(job, "missing report job");
  const name = job[1].match(
    /^    name: \$\{\{ github\.event_name == '([\w-]+)' && '([^']*)' \|\| format\('([^']*)', github\.event_name\) \}\}$/m,
  );
  assert.ok(name, "unsupported report job name");
  const [, event, matched, otherwise] = name;
  return eventName === event ? matched : otherwise.replace("{0}", eventName);
}

function filterSection(filterName, nextFilterName) {
  const match = workflow.match(new RegExp(`\\n            ${filterName}:\\n([\\s\\S]*?)\\n            ${nextFilterName}:`));
  assert.ok(match, `missing ${filterName} filter`);
  return match[1];
}

// The dorny/paths-filter `filters` block: filter name -> glob patterns.
function pathFilters() {
  const block = workflow.match(/\n          filters: \|\n((?: {12}.*\n)+)/);
  assert.ok(block, "missing paths-filter filters block");
  const filters = new Map();
  let current;
  for (const line of block[1].split("\n")) {
    const name = line.match(/^ {12}([\w-]+):$/);
    const pattern = line.match(/^ {14}- "([^"]+)"$/);
    if (name) {
      current = name[1];
      filters.set(current, []);
    } else if (pattern && current) {
      filters.get(current).push(pattern[1]);
    } else if (line !== "") {
      assert.fail(`unexpected filters line: ${line}`);
    }
  }
  return filters;
}

// A filter matches when any changed file matches any of its patterns, as
// paths-filter's default `predicate-quantifier: some` does.
function matchingFilters(changedFiles) {
  const matched = new Set();
  for (const [name, patterns] of pathFilters()) {
    if (changedFiles.some((file) => patterns.some((pattern) => matchesGlob(file, pattern)))) {
      matched.add(name);
    }
  }
  return matched;
}

function jobRuns(jobName, changedFiles) {
  return jobRunsForFilters(jobName, matchingFilters(changedFiles));
}

// Evaluates the job's `if:` on a push, with the `changes` job outputs
// wired from the matched filters.
function jobRunsForFilters(jobName, matchedFilters) {
  const job = workflow.match(new RegExp(`\\n  ${jobName}:\\n((?:    .*\\n)+)`));
  assert.ok(job, `missing ${jobName} job`);
  assert.match(job[1], /^    needs: \[changes\]$/m);
  const condition = job[1].match(/^    if: \$\{\{ (.*) \}\}$/m);
  assert.ok(condition, `missing ${jobName} condition`);

  const outputs = changesOutputs(matchedFilters);
  const context = { "github.event_name": "push" };
  for (const [name, value] of Object.entries(outputs)) {
    context[`needs.changes.outputs.${name}`] = value;
  }
  return condition[1].split(" || ").some((term) => {
    const comparison = term.match(/^([\w.-]+) == '([^']*)'$/);
    assert.ok(comparison, `unsupported condition term: ${term}`);
    assert.ok(comparison[1] in context, `unknown context value: ${comparison[1]}`);
    return context[comparison[1]] === comparison[2];
  });
}

function changesOutputs(matchedFilters) {
  const block = workflow.match(/\n  changes:\n[\s\S]*?\n    outputs:\n((?: {6}.*\n)+)/);
  assert.ok(block, "missing changes job outputs");
  const outputs = {};
  for (const line of block[1].trimEnd().split("\n")) {
    const output = line.match(/^ {6}([\w-]+): \$\{\{ steps\.filter\.outputs\.([\w-]+) \}\}$/);
    assert.ok(output, `unexpected changes output: ${line}`);
    outputs[output[1]] = matchedFilters.has(output[2]) ? "true" : "false";
  }
  return outputs;
}
