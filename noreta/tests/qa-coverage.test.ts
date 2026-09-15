import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Each implemented QA feature owns one test file whose `it` names are exactly
// its scenario titles. Features absent from this map are not implemented yet;
// files absent from it (edge cases, this one) are not scenario files.
const scenarioFiles = new Map([
  ["See active sessions", "active-sessions.test.ts"],
  ["See recent sessions", "recent-sessions.test.ts"],
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

  it("names only features that exist in qa.md", () => {
    const declared = [...scenarioFiles.keys()];
    const present = declared.filter((feature) => featureNames().includes(feature));

    assert.deepEqual(present, declared);
  });
});

function featureNames(): string[] {
  return [...qa().matchAll(/^\s*Feature: (.+)$/gm)].map((match) => match[1].trim());
}

function scenarioTitles(feature: string): string[] {
  return [...featureBlock(feature).matchAll(/^\s*Scenario(?: Outline)?: (.+)$/gm)].map(
    (match) => match[1].trim(),
  );
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
