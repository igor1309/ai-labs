import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const gate = fileURLToPath(new URL("../../audelin/scripts/gate-step.sh", import.meta.url));

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { mode: 0o755 });
}

test("the gate runs on a branch whose name holds a slash", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-step-"));
  const repo = path.join(dir, "repo");
  fs.mkdirSync(path.join(repo, "audelin/macos/App"), { recursive: true });
  write(path.join(repo, "audelin/scripts/swift-test-bounded.sh"), "#!/bin/sh\necho passed\n");
  write(path.join(repo, "audelin/macos/scripts/bundle.sh"), "#!/bin/sh\n");
  write(path.join(dir, "bin/swift"), "#!/bin/sh\n");
  execFileSync("git", ["init", "-q", "-b", "bb/some-step"], { cwd: repo });
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "start"], { cwd: repo });

  const output = execFileSync("sh", [gate], {
    cwd: repo,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${path.join(dir, "bin")}:${process.env.PATH}`,
      AUDELIN_PROBE: path.join(dir, "probe"),
    },
  });

  assert.match(output, /core build ok/);
  assert.match(output, /app build ok/);
  assert.match(output, /bundle ok/);
});
