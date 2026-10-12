import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

// Each Go module, the command that tests it, and the job a change to its
// code runs. A new module fails here until a workflow runs it.
const goModules = {
  agister: { runner: ".github/workflows/agister-core.yml", command: "run: scripts/test.sh", job: "agister-core" },
  gokit: { runner: "agister/scripts/test.sh", command: "../gokit/scripts/test.sh", job: "agister-core" },
  "scripts/agister-gate": {
    runner: ".github/workflows/agister-core.yml",
    command: "working-directory: scripts/agister-gate",
    job: "agister-core",
  },
  warder: { runner: ".github/workflows/warder-core.yml", command: "run: warder/scripts/test.sh", job: "warder-core" },
};

test("ciGoModules_shouldEachBeTestedByTheJobItsChangesRun", () => {
  const modules = execFileSync("git", ["ls-files", "*go.mod"], { cwd: repoRoot, encoding: "utf8" })
    .trim()
    .split("\n")
    .map((file) => file.replace(/\/?go\.mod$/, ""));
  assert.deepEqual(modules.toSorted(), Object.keys(goModules).toSorted());

  for (const [module, { runner, command, job }] of Object.entries(goModules)) {
    assert.ok(readFileSync(new URL(runner, repoRoot), "utf8").includes(command), `${runner} does not test ${module}`);
    assert.equal(jobRuns(job, [`${module}/x.go`]), true, `a change to ${module} does not run ${job}`);
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
