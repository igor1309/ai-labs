import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Overlap is counted against the shorter block, so rewording one side does not hide a
// restatement. Measured here: unrelated blocks share no phrase at all and score 0, two
// statements of one fact score 0.39 and up.
const restatementLimit = 0.35;
const phraseLength = 6;
const shortestClaim = 10;

const testsDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(testsDirectory, "..", "src");

describe("Comment drift", () => {
  it("states no claim in both the code and the tests", () => {
    const code = claims(sourceDirectory, "src");
    const tests = claims(testsDirectory, "tests");

    const restated = code.flatMap((left) =>
      tests
        .filter((right) => overlap(left.phrases, right.phrases) >= restatementLimit)
        .map((right) => `${left.at} <-> ${right.at}: "${left.text}"`),
    );

    assert.deepEqual(restated, [], "a fact a test already carries has no second home in the code");
  });
});


interface Claim {
  at: string;
  text: string;
  phrases: Set<string>;
}

function claims(directory: string, tree: string): Claim[] {
  return sources(directory).flatMap((file) =>
    commentBlocks(readFileSync(join(directory, file), "utf8"))
      .filter((block) => words(block.text).length >= shortestClaim)
      .map((block) => ({
        at: `${tree}/${file}:${block.line}`,
        text: block.text,
        phrases: phrases(block.text),
      })),
  );
}

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name);
}

function commentBlocks(source: string): { line: number; text: string }[] {
  const blocks: { line: number; text: string }[] = [];
  let started = 0;
  let parts: string[] = [];

  source.split("\n").forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("//")) {
      if (parts.length === 0) started = index + 1;
      parts.push(trimmed.slice(2).trim());
      return;
    }

    if (parts.length !== 0) {
      blocks.push({ line: started, text: parts.join(" ") });
      parts = [];
    }
  });

  if (parts.length !== 0) blocks.push({ line: started, text: parts.join(" ") });

  return blocks;
}

function phrases(text: string): Set<string> {
  const spoken = words(text);

  return new Set(
    spoken
      .slice(0, Math.max(0, spoken.length - phraseLength + 1))
      .map((_, start) => spoken.slice(start, start + phraseLength).join(" ")),
  );
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  const shared = [...left].filter((phrase) => right.has(phrase)).length;

  return shared / Math.min(left.size, right.size);
}
