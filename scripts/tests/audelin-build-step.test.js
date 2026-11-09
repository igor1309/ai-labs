import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("../../audelin/scripts/", import.meta.url));

test("the builder is given the brief by an absolute path", () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "build-step-")));
  const bin = path.join(dir, "scripts");
  fs.mkdirSync(bin);
  fs.copyFileSync(path.join(scripts, "build-step.sh"), path.join(bin, "build-step.sh"));
  fs.copyFileSync(path.join(scripts, "brief-rules.md"), path.join(bin, "brief-rules.md"));
  const args = path.join(dir, "args");
  fs.writeFileSync(path.join(bin, "agister-retry.sh"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${args}"\n`, { mode: 0o755 });
  const work = path.join(dir, "work");
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, "brief.md"), "## Intent\n\n## Done when\n\n## Out of scope\n\n## Open\n\nNone.\n");

  execFileSync("sh", [path.join(bin, "build-step.sh"), "brief.md", "out"], { cwd: work, stdio: "pipe" });

  const given = fs.readFileSync(args, "utf8").split("\n");
  assert.ok(given.includes(`brief=${path.join(work, "out", "brief.md")}`), given.join(" "));
  assert.equal(given[given.indexOf("-o") + 1], path.join(work, "out"));
});
