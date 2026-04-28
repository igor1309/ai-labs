import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const PROMPT_DIRECTORY = join("regentara", "src", "prompts");

test("prompt templates should exist for every Regentara agent", async () => {
  const promptFiles = await Promise.all(
    ["producer.md", "reviewer.md", "remediator.md"].map(async (fileName) => {
      try {
        await access(join(PROMPT_DIRECTORY, fileName));
        return fileName;
      } catch {
        return null;
      }
    }),
  );

  assert.deepEqual(promptFiles, ["producer.md", "reviewer.md", "remediator.md"]);
});
