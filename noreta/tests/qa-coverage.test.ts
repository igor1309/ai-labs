import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Each QA feature owns one test file whose `it` names are exactly its scenario
// titles. Every feature in qa.md must appear here, so adding one to the document
// fails this suite until it has tests. Files absent from the map (edge cases,
// this one) are not scenario files.
const scenarioFiles = new Map([
  ["See active sessions", "active-sessions.test.ts"],
  ["See recent sessions", "recent-sessions.test.ts"],
  ["Read a session", "read-session.test.ts"],
  ["Follow an active session", "follow-session.test.ts"],
  ["Find a session", "find-session.test.ts"],
  ["Organize sessions", "organize-sessions.test.ts"],
  ["Access older sessions", "access-older-sessions.test.ts"],
]);

const testsDirectory = dirname(fileURLToPath(import.meta.url));

describe("QA scenario coverage", () => {
  for (const [feature, file] of scenarioFiles) {
    it(`covers every scenario of "${feature}" in ${file}`, () => {
      const scenarios = scenarioTitles(feature);
      const tests = testNames(readFileSync(join(testsDirectory, file), "utf8"));

      assert.notEqual(scenarios.length, 0, `no scenarios parsed for "${feature}"`);
      assert.deepEqual(
        [...tests].sort(),
        [...scenarios].sort(),
        `test names in ${file} must be exactly the scenario titles of "${feature}"`,
      );
    });
  }


  it("accounts for every feature in qa.md", () => {
    assert.deepEqual([...scenarioFiles.keys()].sort(), featureNames().sort());
  });
});


function featureNames(): string[] {
  return [...qa().matchAll(/^\s*Feature: (.+)$/gm)].map((match) => match[1].trim());
}

// A plain scenario is one title. An outline is one title per Examples row,
// suffixed with that row's query — a single test named after the outline could
// otherwise cover one row and look complete.
function scenarioTitles(feature: string): string[] {
  const sections = featureBlock(feature).split(/^\s*Scenario(?: Outline)?: /m).slice(1);

  return sections.flatMap((section) => {
    const title = section.split("\n")[0].trim();
    const queries = [...section.matchAll(/^\s*\|\s*"([^"]+)"\s*\|/gm)].map((row) => row[1]);

    return queries.length === 0 ? [title] : queries.map((query) => `${title}: ${query}`);
  });
}

function featureBlock(feature: string): string {
  const blocks = qa().split(/^\s*Feature: /m);
  const block = blocks.find((candidate) => candidate.startsWith(`${feature}\n`));

  assert.ok(block, `qa.md has no feature named "${feature}"`);

  return block;
}

function testNames(source: string): string[] {
  return [...source.matchAll(/\bit\("((?:[^"\\]|\\.)*)"/g)].map((match) => match[1]);
}

function qa(): string {
  return readFileSync(join(testsDirectory, "..", "docs", "qa.md"), "utf8");
}
