import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import test from "node:test";
import { parse } from "../release/lib/toml.js";

const repoRoot = new URL("../../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/ci.yml", repoRoot), "utf8");

test("ciPathFilters_shouldRunAgonaraCore_onPackageLockChanges", () => {
  const agonaraFilter = filterSection("agonara", "agonara-ci");

  assert.ok(agonaraFilter.includes('"agonara/package-lock.json"'));
});

test("ciPathFilters_shouldRunScreenshotTests_onAgonaraShowcaseCodeChanges", () => {
  for (const file of ["agonara/showcase/screenshots.mjs", "agonara/showcase/screenshots.test.mjs"]) {
    assert.equal(jobRuns("agonara-core", [file]), true, `${file} does not run agonara-core`);
  }
  const core = readFileSync(new URL(".github/workflows/agonara-core.yml", repoRoot), "utf8");
  assert.match(core, /node --test agonara\/showcase\/\*\.test\.mjs/);
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

// One file of each kind Agister's tests read, beside its code: a change to
// any of them must run agister-core.
test("ciPathFilters_shouldRunAgisterCore_onEachKindOfFileItsTestsRead", () => {
  const read = [
    "agister/docs/adr/032-the-advisor-always-decides.md",
    "agister/docs/settings-architecture/notes.md",
    "agister/skills/agister/SKILL.md",
    "agister/README.md",
    "agister/AGENTS.md",
    "agister/testdata/briefs/lab-119-goal.md",
    "agister/scripts/test.sh",
    "agister/home/prompts/go-architecture.md",
    "AGENTS.md",
    "warder/AGENTS.md",
    "gokit/supervisor/supervisor.go",
  ];

  for (const file of read) {
    assert.equal(jobRuns("agister-core", [file]), true, `${file} does not run agister-core`);
  }
});

// The files beyond their code that agonara's and noreta's tests read: a
// change to any of them must run the project's job (LAB-220).
test("ciPathFilters_shouldRunEachProjectsJob_onTheDocumentsItsTestsRead", () => {
  const read = {
    "agonara-core": [
      "agonara/docs/api/openapi.yml",
      "agonara/docs/api/redocly.yaml",
      "agonara/docs/intent/intent_learning_program_app.md",
      "agonara/skills/README.md",
      "agonara/skills-publish-manifest.json",
      "agonara/publish-assets/README.md",
      "docs/loc-dashboard.html",
    ],
    "noreta-core": ["noreta/docs/qa.md"],
  };

  for (const [job, files] of Object.entries(read)) {
    for (const file of files) {
      assert.equal(jobRuns(job, [file]), true, `${file} does not run ${job}`);
    }
  }
});

// The projects whose tests ran in no workflow before LAB-220: each test,
// the command its workflow runs, and the job a change to it runs.
const auditedTests = {
  "session-digest/tests/_bootstrap.test.ts": {
    runner: ".github/workflows/session-digest-core.yml",
    command: "npm run test:session-digest",
    job: "session-digest-core",
  },
  "loki/tests/verify-host.test.js": {
    runner: ".github/workflows/loki-core.yml",
    command: "node --test loki/tests/*.test.js",
    job: "loki-core",
  },
  "neris/packages/swift-neris/Tests/Core/AgentLoopTests.swift": {
    runner: ".github/workflows/neris-core.yml",
    command: "working-directory: neris/packages/swift-neris",
    job: "neris-core",
  },
  "claude-insights/test_claude_insights.py": {
    runner: ".github/workflows/claude-insights-core.yml",
    command: "pytest -q claude-insights/test_claude_insights.py",
    job: "claude-insights-core",
  },
  "claude-insights/supabase/functions/_shared/format.test.ts": {
    runner: ".github/workflows/claude-insights-core.yml",
    command: "deno test format.test.ts",
    job: "claude-insights-core",
  },
  "tests/test_langfuse_shared_stack.py": {
    runner: ".github/workflows/langfuse-core.yml",
    command: "pytest -q tests/test_langfuse_shared_stack.py",
    job: "langfuse-core",
  },
  "tools/mac-health/tests/test-disk.sh": {
    runner: ".github/workflows/mac-health-core.yml",
    command: "sh tools/mac-health/tests/run-all.sh",
    job: "mac-health-core",
  },
};

test("ciAuditedProjects_shouldEachBeTestedByTheJobItsChangesRun", () => {
  for (const [file, { runner, command, job }] of Object.entries(auditedTests)) {
    assert.ok(existsSync(new URL(file, repoRoot)), `${file} does not exist`);
    assert.ok(readFileSync(new URL(runner, repoRoot), "utf8").includes(command), `${runner} does not run ${file}`);
    assert.equal(jobRuns(job, [file]), true, `a change to ${file} does not run ${job}`);
  }
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

test("ciReleaseValidation_shouldRun_onEveryReleaseUnitsVersionFileChange", () => {
  const { units } = parse(readFileSync(new URL("release-units.toml", repoRoot), "utf8"));
  assert.ok(units.length > 0);

  for (const unit of units) {
    const file = `${unit.path}/${unit.metadata}`;
    assert.equal(matchingFilters([file]).has("release"), true, `${file} does not match the release filter`);
    assert.equal(jobRuns("release-validation", [file]), true, `${file} does not run release-validation`);
  }
});

test("ciReleaseValidation_shouldRunReleaseAndShowcaseTests_onShowcaseChanges", () => {
  const job = workflow.match(/\n  release-validation:\n((?:    .*\n|\n)+?)(?=\n  [\w-]+:\n)/);
  assert.ok(job, "missing release-validation job");
  const command = job[1].match(/node --test (.+)$/m);
  assert.ok(command, "release-validation does not run Node tests");
  const globs = command[1].split(" ");

  for (const directory of ["scripts/release/tests", "scripts/showcase/tests"]) {
    const tests = readdirSync(new URL(`${directory}/`, repoRoot)).filter((name) => name.endsWith(".test.js"));
    assert.ok(tests.length > 0);
    for (const name of tests) {
      const file = `${directory}/${name}`;
      assert.ok(globs.some((glob) => matchesGlob(file, glob)), `${file} is not run by release-validation`);
      assert.equal(jobRuns("release-validation", [file]), true, `${file} does not run release-validation`);
    }
  }
  for (const file of ["scripts/showcase/export.js", "scripts/showcase/secret-scanner.js", "scripts/showcase/markers.txt"]) {
    assert.equal(jobRuns("release-validation", [file]), true, `${file} does not run release-validation`);
  }
});

for (const file of [
  "agister/showcase/showcase.toml",
  "agister/showcase/public/go.work",
  "agister/showcase/public/README.md",
  "agister/showcase/AGENTS.md",
  "agister/scripts/check-public.sh",
  "agister/go.mod",
  "rexlab/showcase/showcase.toml",
  "rexlab/showcase/public/LICENSE",
  "rexlab/tests/catalogueSources.test.ts",
]) {
  test(`ciReleaseValidation_shouldRunShowcaseTests_onInputChange: ${file}`, () => {
    assert.equal(matchingFilters([file]).has("release"), true);
    assert.equal(jobRuns("release-validation", [file]), true);
  });
}

// Each Go module, the command that tests it, and the job a change to its
// code runs. A new module fails here until a workflow runs it.
const goModules = {
  agister: { runner: ".github/workflows/agister-core.yml", command: "run: agister/scripts/test.sh", job: "agister-core" },
  gokit: { runner: "agister/scripts/test.sh", command: "../gokit/scripts/test.sh", job: "agister-core" },
  "gokit/tree": { runner: "gokit/scripts/test.sh", command: "check tree gokit/tree", job: "agister-core" },
  warder: { runner: ".github/workflows/warder-core.yml", command: "run: warder/scripts/test.sh", job: "warder-core" },
};

// Go modules no job tests, each with the reason it needs none.
const untestedModules = {
  "agister/archive": "archived, reference only",
};

test("ciGoModules_shouldEachBeTestedByTheJobItsChangesRun", () => {
  const modules = execFileSync("git", ["ls-files", "*go.mod"], { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((file) => file.replace(/\/?go\.mod$/, ""))
    .filter((module) => !(module in untestedModules));
  assert.deepEqual(modules.toSorted(), Object.keys(goModules).toSorted());

  for (const [module, { runner, command, job }] of Object.entries(goModules)) {
    assert.ok(readFileSync(new URL(runner, repoRoot), "utf8").includes(command), `${runner} does not test ${module}`);
    assert.equal(jobRuns(job, [`${module}/x.go`]), true, `a change to ${module} does not run ${job}`);
  }
});

// Test files no path filter covers, each with the reason it needs none.
const unfilteredTests = {
  "scripts/tests/": "repo-scripts runs them on every change",
  "research/": "research, not a product",
  "agister/archive/": "archived, reference only",
};

test("ciTestFiles_shouldEachRunSomeJob_whenChanged", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" }).trim().split("\n");
  const tests = tracked.filter(isTestFile);
  assert.ok(tests.length > 0);
  assert.deepEqual(testsRunningNoJob(tests), []);
  for (const prefix of Object.keys(unfilteredTests)) {
    assert.ok(tests.some((file) => file.startsWith(prefix)), `no test file is under ${prefix}`);
  }
});

test("ciTestFiles_shouldBeNamed_whenNoJobRunsThem", () => {
  const unrun = ["newtool/tests/test-install.sh", "newtool/src/parse.test.ts", "newtool/parse_test.go"];
  assert.deepEqual(unrun.filter(isTestFile), unrun);
  assert.deepEqual(testsRunningNoJob([...unrun, "loki/tests/verify-host.test.js"]), unrun);
});

test("ciJobs_shouldEachRun_onManualDispatch", () => {
  const filtered = [...workflow.matchAll(/\n  ([\w-]+):\n(?:    .*\n)*?    if: (.*needs\.changes\.outputs\..*)\n/g)];
  assert.ok(filtered.length > 0);
  for (const [, job, condition] of filtered) {
    assert.ok(condition.includes("github.event_name == 'workflow_dispatch'"), `${job} does not run on a manual dispatch`);
  }
});

test("ciWeekly_shouldDispatchCiOnTrunk_onASchedule", () => {
  const weekly = readFileSync(new URL(".github/workflows/ci-weekly.yml", repoRoot), "utf8");
  assert.match(weekly, /^  schedule:\n    - cron: "\d+ \d+ \* \* [0-6]"/m);
  assert.match(weekly, /^permissions:\n  actions: write$/m);
  assert.match(weekly, /run: gh workflow run ci\.yml --repo "\$GITHUB_REPOSITORY" --ref trunk$/m);
  assert.match(workflow, /^on:\n(?:  .*\n)*?  workflow_dispatch:$/m);
});

test("ciPush_shouldRunOnlyOnTrunk", () => {
  assert.match(workflow, /^on:\n(?:  #.*\n)*  push:\n    branches:\n      - trunk\n    tags-ignore:\n/m);
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

function isTestFile(file) {
  const named = /(_test\.go|\.(test|spec)\.[cm]?[jt]sx?|(^|\/)test_[^/]*\.py|_test\.py|Tests?\.swift|Test\.kt|\.test\.sh|\.bats)$/;
  const inTestsDirectory = /(^|\/)(tests?|Tests|__tests__)\/.*\.(go|[cm]?[jt]sx?|py|swift|kt|sh)$/;
  return named.test(file) || inTestsDirectory.test(file);
}

// The test files whose change selects no job: no filter that some job's
// condition reads matches them, and no reason in unfilteredTests covers them.
function testsRunningNoJob(files) {
  const read = [...pathFilters()].filter(([name]) => workflow.includes(`needs.changes.outputs.${name} == 'true'`));
  return files.filter((file) => {
    if (Object.keys(unfilteredTests).some((prefix) => file.startsWith(prefix))) {
      return false;
    }
    return !read.some(([, patterns]) => patterns.some((pattern) => matchesGlob(file, pattern)));
  });
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
