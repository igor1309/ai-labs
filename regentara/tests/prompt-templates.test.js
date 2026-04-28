import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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

test("prompt templates should define agent role boundaries", async () => {
  const [producerPrompt, reviewerPrompt, remediatorPrompt] = await Promise.all([
    readFile(join(PROMPT_DIRECTORY, "producer.md"), "utf8"),
    readFile(join(PROMPT_DIRECTORY, "reviewer.md"), "utf8"),
    readFile(join(PROMPT_DIRECTORY, "remediator.md"), "utf8"),
  ]);

  assert.deepEqual(
    {
      producerArtifactRule: producerPrompt.includes("Never set `artifact` to prose"),
      producerWorkRule: producerPrompt.includes("Perform the requested task in the current working directory"),
      remediatorNoEditRule: remediatorPrompt.includes("Do not edit files"),
      remediatorTaskRule: remediatorPrompt.includes("return a revised task"),
      reviewerNoFixRule: reviewerPrompt.includes("Do not implement fixes"),
      reviewerStateRule: reviewerPrompt.includes("Review the actual current repository state"),
      sharedSemanticRule: [producerPrompt, reviewerPrompt, remediatorPrompt]
        .every((prompt) => prompt.includes("Do not put narrative summaries")),
    },
    {
      producerArtifactRule: true,
      producerWorkRule: true,
      remediatorNoEditRule: true,
      remediatorTaskRule: true,
      reviewerNoFixRule: true,
      reviewerStateRule: true,
      sharedSemanticRule: true,
    },
  );
});
