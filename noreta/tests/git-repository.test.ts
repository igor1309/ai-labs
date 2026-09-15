import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { repositoryOf } from "../src/git-repository.js";
import {
  checkoutDirectory,
  directoryIn,
  unversionedDirectory,
  worktreeDirectory,
} from "./git-layouts.js";

describe("Which repository a directory belongs to", () => {
  it("names the checkout it sits at the top of", () => {
    assert.equal(repositoryOf(checkoutDirectory("ai-labs")), "ai-labs");
  });

  // A worktree is a place to work in one repository, not a repository of its
  // own, so its own directory name is not an answer.
  it("names the repository a linked worktree belongs to", () => {
    const repository = checkoutDirectory("ai-labs");

    assert.equal(repositoryOf(worktreeDirectory("product-noreta", repository)), "ai-labs");
  });

  it("names the repository above a directory nested inside it", () => {
    const repository = checkoutDirectory("ai-labs");

    assert.equal(repositoryOf(directoryIn(repository, "noreta", "src")), "ai-labs");
  });

  it("names nothing for a directory in no repository", () => {
    assert.equal(repositoryOf(unversionedDirectory()), undefined);
  });

  // Nothing on disk can answer for a directory that is gone, not even the
  // repository it was deleted from.
  it("names nothing for a directory that does not exist", () => {
    const repository = checkoutDirectory("ai-labs");

    assert.equal(repositoryOf(join(repository, "deleted")), undefined);
  });
});
