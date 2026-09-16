import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { openWorkspaceRepositories } from "../src/workspace-repositories.js";
import { freshMemoryFile, holdWriteLock, memoryFileInMissingDirectory } from "./memory-files.js";

describe("Repositories remembered per workspace", () => {
  it("recalls the repository remembered for a workspace", () => {
    const memory = openWorkspaceRepositories(freshMemoryFile());

    memory.remember("/work/product-noreta", "ai-labs");

    assert.equal(memory.recall("/work/product-noreta"), "ai-labs");
  });

  it("recalls nothing for a workspace never remembered", () => {
    const memory = openWorkspaceRepositories(freshMemoryFile());

    memory.remember("/work/product-noreta", "ai-labs");

    assert.equal(memory.recall("/work/elsewhere"), undefined);
  });

  // A path can be deleted and made again as a checkout of something else.
  it("recalls the repository remembered last for a workspace", () => {
    const memory = openWorkspaceRepositories(freshMemoryFile());

    memory.remember("/work/scratch", "ai-labs");
    memory.remember("/work/scratch", "ci-shared");

    assert.equal(memory.recall("/work/scratch"), "ci-shared");
  });

  // The workspace may be gone by the next run, and with it the only other way
  // to learn its repository.
  it("recalls a repository remembered before the file was reopened", () => {
    const file = freshMemoryFile();
    const before = openWorkspaceRepositories(file);
    before.remember("/work/product-noreta", "ai-labs");
    before.close();

    assert.equal(openWorkspaceRepositories(file).recall("/work/product-noreta"), "ai-labs");
  });

  it("remembers once another process releases the file", async () => {
    const file = freshMemoryFile();
    const memory = openWorkspaceRepositories(file);
    const otherWriter = await holdWriteLock(file, 200);

    memory.remember("/work/product-noreta", "ai-labs");
    await otherWriter.released;

    assert.equal(memory.recall("/work/product-noreta"), "ai-labs");
  });

  it("remembers into a file whose directory does not exist yet", () => {
    const memory = openWorkspaceRepositories(memoryFileInMissingDirectory());

    memory.remember("/work/product-noreta", "ai-labs");

    assert.equal(memory.recall("/work/product-noreta"), "ai-labs");
  });
});
