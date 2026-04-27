import assert from "node:assert/strict";
import test from "node:test";

import { validateProviderCliAvailability } from "../src/provider-cli-availability.js";

test("validateProviderCliAvailability should check runner commands by scanning the process PATH", async () => {
  const checkedPaths = [];

  await validateProviderCliAvailability({
    routes: {
      codex: {
        runner: "codex",
      },
    },
  }, {
    commandExists: undefined,
    environment: {
      PATH: "/opt/bin:/usr/local/bin",
    },
    fileIsExecutable: async (path) => {
      checkedPaths.push(path);
      return path === "/usr/local/bin/codex";
    },
  });

  assert.deepEqual(checkedPaths, ["/opt/bin/codex", "/usr/local/bin/codex"]);
});
